import type { AdapterSession } from '../../types/adapter/adapter-session'
import type { PlannedTry, RunState } from '../../types/run/run-state'
import type { MutantState } from '../../types/run/mutant-state'
import type { BatchPlan } from '../../types/adapter/batch-plan'
import type { RunKind } from '../../types/run/run-kind'

import { getBatchUnitCost } from './get-batch-unit-cost'
import { applyBatchResult } from './apply-batch-result'
import { getDisplayPath } from './get-display-path'
import { countVerdicts } from './count-verdicts'
import { routeIsolated } from './route-isolated'
import { planBatch } from './plan-batch'
import { countRun } from './count-run'

/**
 * Most recovery runs per phase.
 */
const RECOVERY_RUNS = 2

/**
 * Kinds of the runs of one phase: the phase run and its recovery runs.
 */
const PHASE_RUNS: Exclude<RunKind, 'dry'>[] = [
  'batch',
  ...Array.from(
    { length: RECOVERY_RUNS },
    (): Exclude<RunKind, 'dry'> => 'recovery',
  ),
]

/**
 * Runs the batch path. Phase 1 tries every batch mutant in its cheapest
 * covering test; phase 2 tries the mutants that survived or were not reached in
 * all their other covering tests. Tries that go missing are planned again in at
 * most two recovery runs per phase, then the mutant runs isolated. A mutant
 * that only ran out of time skips phase 2; the confirmation run tries those
 * again with doubled bounds and half the workers. Batch decides kills and
 * timeouts only: every mutant left undecided runs isolated, as a
 * `batch-survivor` when a batch try reached it and passed, else as `doubtful`.
 *
 * @param session - Live test runner.
 * @param state - State of the run, updated in place.
 */
export async function runBatchPhases(
  session: AdapterSession,
  state: RunState,
): Promise<void> {
  await runPhase(
    session,
    state,
    getUndecided(state).map(mutant => ({
      test: mutant.queue.shift()!,
      mutant: mutant.mutant.id,
    })),
  )
  await runPhase(
    session,
    state,
    getUndecided(state)
      .filter(mutant => mutant.confirm.length === 0)
      .flatMap(mutant =>
        mutant.queue
          .splice(0)
          .map(test => ({ mutant: mutant.mutant.id, test })),
      ),
  )
  let confirming = getUndecided(state).filter(
    mutant => mutant.confirm.length > 0,
  )
  if (confirming.length > 0) {
    let tries = confirming.flatMap(mutant =>
      mutant.confirm
        .splice(0)
        .map(({ test }) => ({ mutant: mutant.mutant.id, test })),
    )
    let plan = planBatch(state, tries, 2)
    countRun(state, 'confirmation', {
      ...describeBatch(state, plan, 2),
      mutants: confirming.length,
    })
    let missing = applyBatchResult(state, {
      result: await session.runBatch(plan),
      confirming: true,
      plan,
    })
    countVerdicts(state)
    for (let { mutant } of missing) {
      routeIsolated(state, mutant, 'recovery')
    }
  }
  for (let mutant of getUndecided(state)) {
    routeIsolated(
      state,
      mutant.mutant.id,
      mutant.survived ? 'batch-survivor' : 'doubtful',
    )
  }
}

/**
 * Runs one batch phase with its recovery runs. Tries still missing after them
 * send their mutants to the isolated path with one `worker-crash` warning per
 * test file.
 *
 * @param session - Live test runner.
 * @param state - State of the run, updated in place.
 * @param tries - Mutants to try, each in one test.
 */
async function runPhase(
  session: AdapterSession,
  state: RunState,
  tries: PlannedTry[],
): Promise<void> {
  let messages = new Map<string, string>()
  let missing = await PHASE_RUNS.reduce(async (previous, kind) => {
    let left = await previous
    return left.length === 0 ?
        left
      : runBatchOnce(session, state, { tries: left, messages, kind })
  }, Promise.resolve(tries))
  let files = new Set<string>()
  for (let { mutant, test } of missing) {
    files.add(state.analysis.tests.get(test)!.file)
    routeIsolated(state, mutant, 'recovery')
  }
  for (let file of files) {
    let display = getDisplayPath(file, state.root)
    let cause = messages.get(file)
    state.diagnostics.push({
      message: `Batch tries in ${display} went missing in ${RECOVERY_RUNS} recovery runs${cause === undefined ? '' : ` (${cause})`}; their mutants run isolated.`,
      code: 'worker-crash',
      severity: 'warning',
      file: display,
      column: null,
      line: null,
    })
  }
}

/**
 * Runs batch tries once and records the result.
 *
 * @param session - Live test runner.
 * @param state - State of the run, updated in place.
 * @param work - Tries and kind of the run.
 * @param work.messages - Messages of incomplete units by test file, filled in.
 * @param work.tries - Mutants to try, each in one test.
 * @param work.kind - `batch` or `recovery`, for the run count.
 * @returns Tries that went missing.
 */
async function runBatchOnce(
  session: AdapterSession,
  state: RunState,
  work: {
    kind: Exclude<RunKind, 'dry'>
    messages: Map<string, string>
    tries: PlannedTry[]
  },
): Promise<PlannedTry[]> {
  let plan = planBatch(state, work.tries, 1)
  let mutants = new Set(work.tries.map(({ mutant }) => mutant))
  countRun(state, work.kind, {
    ...describeBatch(state, plan, 1),
    mutants: mutants.size,
  })
  let result = await session.runBatch(plan)
  for (let incomplete of result.incomplete) {
    work.messages.set(plan.units[incomplete.unit]!.file, incomplete.message)
  }
  let missing = applyBatchResult(state, { confirming: false, result, plan })
  countVerdicts(state)
  return missing
}

/**
 * Describes the units of a batch plan for the progress: their expected costs
 * (`getBatchUnitCost`), one serial chain per unit, as a batch plan has one unit
 * per test file, and the workers of the plan.
 *
 * @param state - State of the run.
 * @param plan - Plan of the run.
 * @param scale - 1, or 2 for a run that confirms timeouts.
 * @returns Work of the run without its mutants.
 */
function describeBatch(
  state: RunState,
  plan: BatchPlan,
  scale: number,
): { chains: number[]; workers: number; costs: number[] } {
  return {
    costs: plan.units.map(unit => getBatchUnitCost(state, unit, scale)),
    chains: plan.units.map((_unit, index) => index),
    workers: plan.concurrency!,
  }
}

/**
 * Lists the mutants still undecided on the batch path, in run order.
 *
 * @param state - State of the run.
 * @returns Their states.
 */
function getUndecided(state: RunState): MutantState[] {
  return [...state.mutants.values()].filter(
    mutant => mutant.path === 'batch' && mutant.verdict === null,
  )
}
