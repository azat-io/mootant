import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { VitestPlanFile } from '../types/vitest-worker'

/**
 * Reads the plan of a test file that the main process wrote for this run.
 *
 * @param directory - Work directory of the run.
 * @param hash - Name of the test file in the work directory (`getFileHash`).
 * @returns Units of the test file with their indexes in the run's plan, or null
 *   when nothing is planned for the file.
 * @throws {Error} When the plan exists but cannot be read.
 */
export function readWorkerPlan(
  directory: string,
  hash: string,
): VitestPlanFile | null {
  let text: string
  try {
    text = readFileSync(path.join(directory, 'plan', `${hash}.json`), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
  return JSON.parse(text) as VitestPlanFile
}
