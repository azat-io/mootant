import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

/**
 * Folders of the work directory that hold the files of one Vitest run.
 */
const RUN_FOLDERS = ['beat', 'claim', 'out', 'plan', 'worker']

/**
 * Empties the folders of the previous Vitest run: plans, claims, worker ids,
 * out files and heartbeats. A heartbeat, claim or worker id left from an
 * earlier run must never be read as one of this run.
 *
 * @param directory - Work directory of the session.
 */
export function resetRunDirectory(directory: string): void {
  for (let folder of RUN_FOLDERS) {
    let target = path.join(directory, folder)
    rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
  }
}
