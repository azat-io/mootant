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

import { buildIsolatedFacts } from './build-isolated-facts'
import { readUnitInputs } from './read-unit-inputs'
import { runPlan } from './run-plan'

/**
 * End record of a unit.
 */
type VitestEndRecord = Extract<VitestOutRecord, { kind: 'end' }>

/**
 * Executes isolated units in one Vitest run, each on its whole test file and
 * the worker's teardown. A unit no worker claimed has no facts; a claimed unit
 * gets its facts from what its worker left (`buildIsolatedFacts`), as the unit
 * ends too, for the context's `onUnitEnd`. A unit that ended reports what it
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
  let outcome = await runPlan(handle, {
    describe: (unit, ended) => buildIsolatedFacts(handle, unit, ended),
    units: plan.units,
    mode: 'isolated',
  })
  let units: IsolatedFacts[] = []
  let ended: [IsolatedFacts, IsolatedUnit, VitestEndRecord][] = []
  for (let [unit, found] of outcome.units.entries()) {
    if (!found.claimed) {
      continue
    }
    let facts = buildIsolatedFacts(handle, unit, found)
    units.push(facts)
    let end = found.records.find(record => record.kind === 'end')
    if (end !== undefined) {
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
