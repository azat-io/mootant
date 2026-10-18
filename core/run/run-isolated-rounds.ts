import type { IsolatedRequest, RunState } from '../../types/run/run-state'
import type { AdapterSession } from '../../types/adapter/adapter-session'

import { applyIsolatedResult } from './apply-isolated-result'
import { planIsolated } from './plan-isolated'
import { countRun } from './count-run'

/**
 * Runs the isolated path in rounds, one run of the test runner each, until no
 * undecided mutant has a test file left and no retry or confirmation is
 * pending. Every undecided isolated mutant takes its next test files in the
 * order of `routeIsolated`, the likeliest to kill it first: one in the first
 * and the second round, then twice as many as in the round before (2, 4, 8, and
 * so on), so a mutant stops at the batch of the file that killed it, and a
 * survivor, which must run every file, needs only a few rounds. Idle workers
 * take no extra files: a unit can wait for another of its test file, and the
 * pool runs units in order, so extra files may make a round longer, and
 * measurements showed no gain. A mutant whose timeout waits for its
 * confirmation takes no new files until the confirmation decides it. The
 * verdict comes from the first file with evidence (`decideEvidence`), so it
 * does not depend on the batches or the workers. A round also runs the retries
 * and confirmations of the round before. A request lives at most four rounds,
 * as a unit missing twice gets an `Error` verdict and a timeout is confirmed
 * once, so the rounds end.
 *
 * @param session - Live test runner.
 * @param state - State of the run, updated in place.
 */
export async function runIsolatedRounds(
  session: AdapterSession,
  state: RunState,
): Promise<void> {
  await runRounds(session, state, { carried: [], round: 0 })
}

/**
 * Runs one isolated round: the requests carried over from the round before that
 * are still undecided, and the next test files of every undecided mutant.
 *
 * @param session - Live test runner.
 * @param state - State of the run, updated in place.
 * @param progress - Requests carried over and rounds so far.
 * @param progress.carried - Retries and confirmations of the round before.
 * @param progress.round - Rounds so far.
 * @returns Retries and confirmations for the next round, or null when the round
 *   had nothing to run.
 */
async function runRound(
  session: AdapterSession,
  state: RunState,
  progress: { carried: IsolatedRequest[]; round: number },
): Promise<IsolatedRequest[] | null> {
  let { carried, round } = progress
  let requests = carried.filter(
    request => state.mutants.get(request.mutant)!.verdict === null,
  )
  let next = [...state.mutants.values()].filter(
    mutant =>
      mutant.path === 'isolated' &&
      mutant.verdict === null &&
      mutant.files.length > 0 &&
      ![...mutant.evidence.values()].includes('confirming'),
  )
  let size = round === 0 ? 1 : 2 ** (round - 1)
  let taken = new Map(
    next.map(mutant => [mutant, mutant.files.splice(0, size)]),
  )
  for (let [mutant, files] of taken) {
    for (let file of files) {
      requests.push({
        mutant: mutant.mutant.id,
        confirming: false,
        retried: false,
        file,
      })
    }
  }
  if (requests.length === 0) {
    return null
  }
  let plan = planIsolated(state, requests)
  let mutants = new Set(requests.map(({ mutant }) => mutant))
  countRun(state, 'isolated', {
    units: plan.units.length,
    mutants: mutants.size,
  })
  let result = await session.runIsolated(plan)
  return applyIsolatedResult(state, { requests, plan }, result)
}

/**
 * Runs isolated rounds from the given one until nothing is left to run.
 *
 * @param session - Live test runner.
 * @param state - State of the run, updated in place.
 * @param progress - Requests carried over and the number of the round.
 * @param progress.carried - Retries and confirmations of the round before.
 * @param progress.round - Rounds so far.
 */
async function runRounds(
  session: AdapterSession,
  state: RunState,
  progress: { carried: IsolatedRequest[]; round: number },
): Promise<void> {
  let carried = await runRound(session, state, progress)
  if (carried !== null) {
    await runRounds(session, state, { round: progress.round + 1, carried })
  }
}
