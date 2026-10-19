import type { IsolatedFacts } from '../../types/adapter/isolated-result'
import type { VitestHandle } from './types/vitest-session-state'
import type { UnitOutcome } from './types/unit-outcome'

import { isTimeoutMessage } from './worker/is-timeout-message'

/**
 * Builds the facts of a claimed isolated unit from what its worker left, but
 * what it read: a unit without an end record is `hang` when the watchdog
 * stopped its worker, else `crash`. A failed cleanup of worker-scoped fixtures
 * or a failed teardown of the test environment is the unit's hook error; a
 * suite hook that hit Vitest's hook timeout marks the unit as timed out. A unit
 * that ended reports how long its process took to start: from the moment the
 * pool started the worker to the moment the worker began the unit, before it
 * waited for its turn.
 *
 * @param handle - Live Vitest instance of the session.
 * @param unit - Index of the unit in the plan.
 * @param outcome - What the unit left behind.
 * @returns Facts of the unit.
 */
export function buildIsolatedFacts(
  handle: VitestHandle,
  unit: number,
  outcome: Omit<UnitOutcome, 'claimed'>,
): IsolatedFacts {
  let { records, hung, pid } = outcome
  let tests = records.flatMap(record =>
    record.kind === 'test' ? record.tries : [],
  )
  let end = records.find(record => record.kind === 'end')
  if (end === undefined) {
    return {
      duration: tests.reduce((sum, facts) => sum + facts.duration, 0),
      hits: tests.reduce((sum, facts) => sum + facts.hits, 0),
      incomplete: hung === null ? 'crash' : 'hang',
      reached: tests.some(facts => facts.reached),
      timedOut: false,
      hookError: null,
      loadError: null,
      strays: [],
      tests,
      unit,
    }
  }
  let spawned = handle.state.spawns.get(pid!)
  return {
    startup: spawned === undefined ? 0 : Math.max(0, end.booted - spawned),
    timedOut: end.hookError !== null && isTimeoutMessage(end.hookError),
    hookError: end.hookError,
    loadError: end.loadError,
    duration: end.duration,
    reached: end.reached,
    strays: end.strays,
    incomplete: null,
    hits: end.hits,
    tests,
    unit,
  }
}
