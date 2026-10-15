import type { IsolatedRequest, RunState } from '../../types/run/run-state'
import type { AdapterSession } from '../../types/adapter/adapter-session'

import { applyIsolatedResult } from './apply-isolated-result'
import { planIsolated } from './plan-isolated'
import { countRun } from './count-run'

/**
 * Most isolated runs: two rounds and one more for retries and confirmations.
 */
const ISOLATED_RUNS = 3

/**
 * Runs the isolated path. The first run tries every isolated mutant in its
 * cheapest test file; the next tries the undecided ones in all their other
 * files, together with units that went missing and timeouts to confirm; a last
 * run takes the retries and confirmations of the second. Only timeouts to
 * confirm can be left after it, since a unit missing twice already gets an
 * `Error` verdict; their mutants get one too.
 *
 * @param session - Live test runner.
 * @param state - State of the run, updated in place.
 */
export async function runIsolatedRounds(
  session: AdapterSession,
  state: RunState,
): Promise<void> {
  let carried = await Array.from(
    { length: ISOLATED_RUNS },
    (_value, run) => run,
  ).reduce<Promise<IsolatedRequest[]>>(
    async (previous, run) =>
      runRound(session, state, { carried: await previous, run }),
    Promise.resolve([]),
  )
  for (let request of carried) {
    let mutant = state.mutants.get(request.mutant)!
    mutant.verdict ??= {
      message: 'A timeout could not be confirmed: no isolated run was left.',
      status: 'Error',
      cause: null,
      file: null,
      test: null,
    }
  }
}

/**
 * Runs one isolated run: the requests carried over from the previous run, and
 * the files of every undecided mutant, its cheapest one in the first run and
 * all others later.
 *
 * @param session - Live test runner.
 * @param state - State of the run, updated in place.
 * @param progress - Requests carried over and runs so far.
 * @param progress.carried - Retries and confirmations of the previous run.
 * @param progress.run - Isolated runs so far.
 * @returns Retries and confirmations for the next run.
 */
async function runRound(
  session: AdapterSession,
  state: RunState,
  progress: { carried: IsolatedRequest[]; run: number },
): Promise<IsolatedRequest[]> {
  let { carried, run } = progress
  let requests = carried.filter(
    request => state.mutants.get(request.mutant)!.verdict === null,
  )
  for (let mutant of state.mutants.values()) {
    if (mutant.path === 'isolated' && mutant.verdict === null) {
      let files = mutant.files.splice(0, run === 0 ? 1 : Infinity)
      for (let file of files) {
        requests.push({
          mutant: mutant.mutant.id,
          confirming: false,
          retried: false,
          file,
        })
      }
    }
  }
  if (requests.length === 0) {
    return []
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
