import type {
  IsolatedResult,
  IsolatedFacts,
} from '../../types/adapter/isolated-result'
import type {
  IsolatedPlan,
  IsolatedUnit,
} from '../../types/adapter/isolated-plan'
import type { VitestHandle } from './types/vitest-session-state'
import type { VitestOutRecord } from './types/vitest-worker'

import { isTimeoutMessage } from './worker/is-timeout-message'
import { readUnitInputs } from './read-unit-inputs'
import { runPlan } from './run-plan'

/**
 * End record of a unit.
 */
type VitestEndRecord = Extract<VitestOutRecord, { kind: 'end' }>

/**
 * Executes isolated units in one Vitest run, each on its whole test file and
 * the worker's teardown. A unit no worker claimed has no facts; a claimed unit
 * without an end record is `hang` when the watchdog stopped its worker, else
 * `crash`. A failed cleanup of worker-scoped fixtures or a failed teardown of
 * the test environment is the unit's hook error; a suite hook that hit Vitest's
 * hook timeout marks the unit as timed out. A unit that ended reports what it
 * read (`readUnitInputs`).
 *
 * @param handle - Live Vitest instance of the session.
 * @param plan - Units to run.
 * @returns Facts of the units that ran.
 */
export async function runIsolated(
  handle: VitestHandle,
  plan: IsolatedPlan,
): Promise<IsolatedResult> {
  let outcome = await runPlan(handle, { units: plan.units, mode: 'isolated' })
  let units: IsolatedFacts[] = []
  let ended: [IsolatedFacts, IsolatedUnit, VitestEndRecord][] = []
  for (let [unit, { records, claimed, hung }] of outcome.units.entries()) {
    if (!claimed) {
      continue
    }
    let tests = records.flatMap(record =>
      record.kind === 'test' ? record.tries : [],
    )
    let end = records.find(record => record.kind === 'end')
    if (end === undefined) {
      units.push({
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
      })
    } else {
      let facts: IsolatedFacts = {
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
      units.push(facts)
      ended.push([facts, plan.units[unit]!, end])
    }
  }
  let tsconfigs = new Map<string, string[]>()
  await Promise.all(
    ended.map(async ([facts, unit, end]) => {
      facts.inputs = await readUnitInputs(handle, { ...unit, tsconfigs }, end)
    }),
  )
  return { units }
}
