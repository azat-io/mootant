import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { IsolatedUnit } from '../../types/adapter/isolated-plan'
import type { BatchUnit } from '../../types/adapter/batch-plan'
import type { VitestPlanFile } from './types/vitest-worker'

import { getFileHash } from './worker/get-file-hash'

/**
 * Writes one plan file per test file and project, `plan/<hash>.json`, with the
 * units of that file and their indexes in the run's plan. A worker claims the
 * units of its test file in this order.
 *
 * @param directory - Work directory of the session.
 * @param units - Units of the run in plan order.
 * @returns Name of each unit's claim and out file, `<hash>-<n>`, in plan order.
 */
export async function writePlanFiles(
  directory: string,
  units: readonly (IsolatedUnit | BatchUnit)[],
): Promise<string[]> {
  let plans = new Map<string, VitestPlanFile>()
  let names = units.map((unit, index) => {
    let hash = getFileHash(unit.file, unit.project)
    let plan = plans.get(hash) ?? { indexes: [], units: [] }
    plans.set(hash, plan)
    plan.units.push(unit)
    plan.indexes.push(index)
    return `${hash}-${plan.units.length - 1}`
  })
  await Promise.all(
    [...plans].map(([hash, plan]) =>
      writeFile(
        path.join(directory, 'plan', `${hash}.json`),
        JSON.stringify(plan),
      ),
    ),
  )
  return names
}
