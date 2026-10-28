import type { BatchPlan, BatchTest } from '../../types/adapter/batch-plan'
import type { PlannedTry, RunState } from '../../types/run/run-state'
import type { BatchResult } from '../../types/adapter/batch-result'
import type { MutantState } from '../../types/run/mutant-state'
import type { RunInputs } from '../../types/adapter/run-inputs'
import type { TryVerdict } from '../../types/run/try-verdict'
import type { TryFacts } from '../../types/adapter/try-facts'

import { getDisplayPath } from './get-display-path'
import { routeIsolated } from './route-isolated'
import { classifyTry } from './classify-try'

/**
 * What recording the tries of one planned test of a batch run needs.
 */
interface BatchTestContext {
  /**
   * What the unit read, if the adapter reported it.
   */
  inputs: RunInputs | undefined

  /**
   * Whether the run confirms timeouts with doubled bounds.
   */
  confirming: boolean

  /**
   * The planned test with its limits and mutants.
   */
  test: BatchTest

  /**
   * Whether the adapter stopped the worker of the unit.
   */
  hung: boolean

  /**
   * Absolute path of the test file of the unit.
   */
  file: string
}

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
  let untried: PlannedTry[] = []
  for (let [index, unit] of plan.units.entries()) {
    let unitTries = result.tries.filter(facts => facts.unit === index)
    let inputs = result.inputs?.find(entry => entry.unit === index)
    for (let test of unit.tests) {
      let tries = unitTries.filter(facts => facts.test === test.id)
      recordTestTries(state, tries, {
        hung: hung.has(index),
        file: unit.file,
        confirming,
        inputs,
        test,
      })
      untried.push(...listUntried(test, tries))
    }
  }
  isolateSpoiled(state, run)
  return untried.filter(({ mutant: id }) => {
    let mutant = state.mutants.get(id)!
    return (
      mutant.verdict === null &&
      mutant.path === 'batch' &&
      mutant.confirm.length === 0
    )
  })
}

/**
 * Applies a mutant try to its mutant, still undecided on the batch path. A pass
 * goes to the cache whether it reached the mutant or not, and a reached pass
 * marks the mutant survived; a doubtful try sends it to the isolated path; a
 * timeout of the timer takes the cause `hang` when the worker of the unit hung,
 * and a hit-limit timeout, or any timeout in a run that confirms timeouts, is
 * final, any other waits for a confirmation; a kill is final and goes to the
 * cache.
 *
 * @param state - State of the run, updated in place.
 * @param mutant - Mutant of the try, undecided on the batch path.
 * @param attempt - Outcome, cause and message of the try, with its test, unit
 *   and run.
 */
function recordBatchTry(
  state: RunState,
  mutant: MutantState,
  attempt: { message: string | null } & BatchTestContext & TryVerdict,
): void {
  let { confirming, outcome, cause, test, hung } = attempt
  let evidence = {
    message: attempt.message,
    file: attempt.file,
    test: test.id,
  }
  switch (outcome) {
    case 'unreached':
    case 'survived': {
      if (outcome === 'survived') {
        mutant.survived = true
      }
      state.cache?.recordBatch(mutant, test.id, {
        inputs: attempt.inputs,
        verdict: 'survived',
      })

      break
    }
    case 'doubtful': {
      routeIsolated(state, mutant.mutant.id, 'doubtful')

      break
    }
    case 'timeout': {
      let timeoutCause = cause === 'time-limit' && hung ? 'hang' : cause!
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
        verdict: mutant.verdict,
        inputs: attempt.inputs,
      })

      break
    }
    // No default
  }
}

/**
 * Records the tries of one planned test in the order they ran. Every mutant try
 * counts on its mutant and tries of unknown mutants are ignored; a try decides
 * only while its mutant is undecided on the batch path.
 *
 * @param state - State of the run, updated in place.
 * @param tries - Facts of the tries of the test, control tries included.
 * @param context - The planned test, what its unit read and how the run went.
 */
function recordTestTries(
  state: RunState,
  tries: readonly TryFacts[],
  context: BatchTestContext,
): void {
  for (let [position, facts] of tries.entries()) {
    if (facts.mutant === null) {
      continue
    }
    let mutant = state.mutants.get(facts.mutant)
    if (mutant === undefined) {
      continue
    }
    mutant.tries += 1
    mutant.duration += facts.duration
    if (mutant.verdict !== null || mutant.path !== 'batch') {
      continue
    }
    recordBatchTry(state, mutant, {
      ...classifyBatchTry(facts, context.test, {
        before: tries[position - 1],
        after: tries[position + 1],
      }),
      message: facts.message,
      ...context,
    })
  }
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
 * Sends the mutants of spoiled tries that are still undecided on the batch path
 * to the isolated path: first every mutant planned in a unit whose suite hook
 * failed, then the mutant of each late error.
 *
 * @param state - State of the run, updated in place.
 * @param run - The run to record.
 * @param run.result - What the adapter reported.
 * @param run.plan - Plan the run executed.
 */
function isolateSpoiled(
  state: RunState,
  run: { result: BatchResult; plan: BatchPlan },
): void {
  let { result, plan } = run
  let spoiled = [
    ...result.hookErrors.flatMap(({ unit }) =>
      plan.units[unit]!.tests.flatMap(test => test.mutants),
    ),
    ...result.late.map(late => late.mutant),
  ]
  for (let id of spoiled) {
    let mutant = id === null ? undefined : state.mutants.get(id)
    if (mutant?.verdict === null && mutant.path === 'batch') {
      routeIsolated(state, mutant.mutant.id, 'doubtful')
    }
  }
}

/**
 * Classifies a mutant try of a batch run by the control tries next to it. A
 * kill or a hit-limit timeout counts only when the control tries right before
 * and right after it passed; a timeout of the timer only needs a passing
 * control before it, since the worker gives up the unit. Otherwise the try is
 * doubtful.
 *
 * @param facts - Facts of the mutant try.
 * @param test - The planned test with its limits.
 * @param controls - Tries right before and right after it.
 * @param controls.before - Try right before it, if there is one.
 * @param controls.after - Try right after it, if there is one.
 * @returns Outcome and cause of the try.
 */
function classifyBatchTry(
  facts: TryFacts,
  test: BatchTest,
  controls: { before: undefined | TryFacts; after: undefined | TryFacts },
): TryVerdict {
  let { outcome, cause } = classifyTry(facts, test, 'batch')
  let needsAfter = outcome === 'killed' || cause === 'hit-limit'
  if (
    (needsAfter || outcome === 'timeout') &&
    (!isGoodControl(controls.before) ||
      (needsAfter && !isGoodControl(controls.after)))
  ) {
    outcome = 'doubtful'
  }
  return { outcome, cause }
}

/**
 * Lists the planned tries of a test that have no facts. A leading control try
 * that skipped itself ends the repeats of the test, so its mutants count as
 * tried without evidence rather than missing.
 *
 * @param test - The planned test with its mutants.
 * @param tries - Facts of the tries of the test, control tries included.
 * @returns Planned tries of the test without facts, in plan order.
 */
function listUntried(
  test: BatchTest,
  tries: readonly TryFacts[],
): PlannedTry[] {
  if (tries.length === 1 && tries[0]!.mutant === null && tries[0]!.skipped) {
    return []
  }
  let tried = new Set(tries.map(facts => facts.mutant))
  return test.mutants
    .filter(id => !tried.has(id))
    .map(id => ({ test: test.id, mutant: id }))
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
