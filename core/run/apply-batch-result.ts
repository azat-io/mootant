import type { PlannedTry, RunState } from '../../types/run/run-state'
import type { BatchResult } from '../../types/adapter/batch-result'
import type { BatchPlan } from '../../types/adapter/batch-plan'
import type { TryFacts } from '../../types/adapter/try-facts'

import { getDisplayPath } from './get-display-path'
import { routeIsolated } from './route-isolated'
import { classifyTry } from './classify-try'

/**
 * Records what a batch run reported, in fast mode. Each mutant try is
 * classified. Only kills are accepted, and a kill or hit-limit timeout only
 * when the control tries right before and right after it both passed, else it
 * is doubtful. An accepted kill is heuristic and final: passing controls do not
 * prove that the mutant alone fails the test, since state an earlier try left
 * can fail it, such as a value a control try set that the mutant no longer
 * resets; the default mode decides every mutant isolated instead. A try that
 * ran out of time has no control after it, since the worker gives up the unit:
 * it counts only after a passing control, and then waits for a confirmation
 * with doubled bounds in a fresh run, or is final when the run was one.
 * Doubtful tries and late errors send the mutant to the isolated path; a
 * reached pass is only noted, since state left by a control try may hide the
 * mutant, and the core rechecks it on the isolated path. A unit whose suite
 * hook failed sends every mutant it planned that is still undecided to the
 * isolated path. A test whose leading control skipped itself ends its repeats
 * there, so its mutants count as tried without evidence rather than missing. A
 * hung unit gets a `worker-hang` warning and its timed-out try the cause
 * `hang`. Accepted kills and passes, whether they reached the mutant or not, go
 * to the cache of the run, so a later run reuses a kill only after the same
 * passes, unless the kill came from the first test of the mutant
 * (`applyCachedBatch`).
 *
 * @param state - State of the run, updated in place.
 * @param run - The run to record.
 * @param run.plan - Plan the run executed.
 * @param run.result - What the adapter reported.
 * @param run.confirming - Whether the run confirmed timeouts with doubled
 *   bounds.
 * @returns Planned tries without facts whose mutant is still undecided on the
 *   batch path.
 */
export function applyBatchResult(
  state: RunState,
  run: { result: BatchResult; confirming: boolean; plan: BatchPlan },
): PlannedTry[] {
  let { confirming, result, plan } = run
  let hung = new Set<number>()
  for (let incomplete of result.incomplete) {
    if (incomplete.reason === 'hang') {
      hung.add(incomplete.unit)
      reportHang(
        state,
        plan.units[incomplete.unit]!.file,
        result.tries.findLast(
          facts => facts.unit === incomplete.unit && facts.timedOut,
        ),
      )
    }
  }
  let seen = new Set<string>()
  for (let [index, unit] of plan.units.entries()) {
    let unitTries = result.tries.filter(facts => facts.unit === index)
    for (let test of unit.tests) {
      let tries = unitTries.filter(facts => facts.test === test.id)
      if (
        tries.length === 1 &&
        tries[0]!.mutant === null &&
        tries[0]!.skipped
      ) {
        for (let id of test.mutants) {
          seen.add(`${index}\n${test.id}\n${id}`)
        }
      }
      for (let [position, facts] of tries.entries()) {
        if (facts.mutant === null) {
          continue
        }
        seen.add(`${index}\n${test.id}\n${facts.mutant}`)
        let mutant = state.mutants.get(facts.mutant)
        if (mutant === undefined) {
          continue
        }
        mutant.tries += 1
        mutant.duration += facts.duration
        if (mutant.verdict !== null || mutant.path !== 'batch') {
          continue
        }
        let { outcome, cause } = classifyTry(facts, test, 'batch')
        let needsAfter = outcome === 'killed' || cause === 'hit-limit'
        if (
          (needsAfter || outcome === 'timeout') &&
          (!isGoodControl(tries[position - 1]) ||
            (needsAfter && !isGoodControl(tries[position + 1])))
        ) {
          outcome = 'doubtful'
        }
        let evidence = {
          message: facts.message,
          file: unit.file,
          test: test.id,
        }
        switch (outcome) {
          case 'unreached':
          case 'survived': {
            if (outcome === 'survived') {
              mutant.survived = true
            }
            state.cache?.recordBatch(mutant, test.id, {
              inputs: result.inputs?.find(inputs => inputs.unit === index),
              verdict: 'survived',
            })

            break
          }
          case 'doubtful': {
            routeIsolated(state, facts.mutant, 'doubtful')

            break
          }
          case 'timeout': {
            let timeoutCause =
              cause === 'time-limit' && hung.has(index) ? 'hang' : cause!
            if (timeoutCause === 'hit-limit' || confirming) {
              mutant.verdict = {
                cause: timeoutCause,
                status: 'Timeout',
                ...evidence,
              }
            } else {
              mutant.confirm.push({
                cause: timeoutCause as 'time-limit' | 'hang',
                test: test.id,
              })
            }

            break
          }
          case 'killed': {
            mutant.verdict = { status: 'Killed', cause, ...evidence }
            state.cache?.recordBatch(mutant, test.id, {
              inputs: result.inputs?.find(inputs => inputs.unit === index),
              verdict: mutant.verdict,
            })

            break
          }
          // No default
        }
      }
    }
  }
  for (let { unit } of result.hookErrors) {
    let { tests } = plan.units[unit]!
    for (let test of tests) {
      for (let id of test.mutants) {
        let mutant = state.mutants.get(id)!
        if (mutant.verdict === null && mutant.path === 'batch') {
          routeIsolated(state, id, 'doubtful')
        }
      }
    }
  }
  for (let late of result.late) {
    let mutant =
      late.mutant === null ? undefined : state.mutants.get(late.mutant)
    if (mutant?.verdict === null && mutant.path === 'batch') {
      routeIsolated(state, late.mutant!, 'doubtful')
    }
  }
  let missing: PlannedTry[] = []
  for (let [index, unit] of plan.units.entries()) {
    for (let test of unit.tests) {
      for (let id of test.mutants) {
        let mutant = state.mutants.get(id)!
        if (
          !seen.has(`${index}\n${test.id}\n${id}`) &&
          mutant.verdict === null &&
          mutant.path === 'batch' &&
          mutant.confirm.length === 0
        ) {
          missing.push({ test: test.id, mutant: id })
        }
      }
    }
  }
  return missing
}

/**
 * Adds a `worker-hang` warning for a unit whose worker the adapter stopped,
 * naming the test and mutant of its last timed-out try.
 *
 * @param state - State of the run.
 * @param file - Absolute path of the test file of the unit.
 * @param hungTry - Last try of the unit that ran out of time, if reported.
 */
function reportHang(
  state: RunState,
  file: string,
  hungTry: undefined | TryFacts,
): void {
  let where = ''
  if (hungTry !== undefined) {
    let name = state.analysis.tests.get(hungTry.test)?.name ?? hungTry.test
    where =
      hungTry.mutant === null ?
        ` in "${name}" without a mutant`
      : ` in "${name}" with mutant ${hungTry.mutant}`
  }
  state.diagnostics.push({
    message: `The worker running ${getDisplayPath(file, state.root)} stopped responding${where} and was stopped.`,
    file: getDisplayPath(file, state.root),
    code: 'worker-hang',
    severity: 'warning',
    column: null,
    line: null,
  })
}

/**
 * Tells whether a try is a control try that went right: it ran without a mutant
 * and did not fail, run out of time or have stray errors.
 *
 * @param facts - Facts of the try next to a mutant try, if there is one.
 * @returns Whether the original code behaved in the try.
 */
function isGoodControl(facts: undefined | TryFacts): boolean {
  return (
    facts?.mutant === null &&
    !facts.failed &&
    !facts.timedOut &&
    facts.strays.length === 0
  )
}
