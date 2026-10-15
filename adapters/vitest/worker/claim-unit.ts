import { closeSync, writeSync, openSync } from 'node:fs'
import path from 'node:path'

/**
 * Claims the first free unit of a test file for this worker. Several workers
 * may be given the same test file in one run; each one creates the claim file
 * of a unit exclusively, so no unit runs twice. The claim file holds the
 * process id of the worker, so the worker of the next unit can tell when this
 * one is gone (`waitForTurn`).
 *
 * @param directory - Work directory of the run.
 * @param hash - Name of the test file in the work directory (`getFileHash`).
 * @param count - Units planned for the test file.
 * @returns Position of the claimed unit among the file's units, or null when
 *   every unit is taken.
 * @throws {Error} When a claim file cannot be created for another reason than
 *   being taken.
 */
export function claimUnit(
  directory: string,
  hash: string,
  count: number,
): number | null {
  for (let index = 0; index < count; index++) {
    let descriptor: number
    try {
      descriptor = openSync(
        path.join(directory, 'claim', `${hash}-${index}`),
        'wx',
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
      continue
    }
    writeSync(descriptor, String(process.pid))
    closeSync(descriptor)
    return index
  }
  return null
}
