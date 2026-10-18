import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

import type { SwitchedFile } from '../../types/adapter/switched-file'
import type { NodeTestPlan } from './types/node-test-plan'

/**
 * Writes a switch plan into an emptied directory: one JSON file per switched
 * file with its `SwitchedFile`, and the index `plan.json` of their paths by the
 * real path of each switched file (`NodeTestPlan`).
 *
 * @param directory - Directory of the plan; emptied first.
 * @param files - Switched files; none for a plan that switches nothing.
 * @returns Absolute path of `plan.json`.
 */
export function writeSwitchPlan(
  directory: string,
  files: readonly SwitchedFile[],
): string {
  rmSync(directory, { recursive: true, force: true })
  mkdirSync(directory, { recursive: true })
  let plan: NodeTestPlan = {}
  for (let [index, entry] of files.entries()) {
    let target = path.join(directory, `${index}.json`)
    writeFileSync(target, JSON.stringify(entry))
    plan[entry.file] = target
  }
  let index = path.join(directory, 'plan.json')
  writeFileSync(index, JSON.stringify(plan))
  return index
}
