import { readdirSync } from 'node:fs'
import path from 'node:path'

import type { VitestOutRecord } from './types/vitest-worker'

import { readOutFile } from './read-out-file'

/**
 * Reads the records workers wrote in a run (`readOutFile`).
 *
 * @param directory - Work directory of the session.
 * @returns Records of each out file in the order they were written, by file
 *   name without the extension (`<hash>-<n>`).
 */
export function readOutFiles(
  directory: string,
): Map<string, VitestOutRecord[]> {
  let folder = path.join(directory, 'out')
  let files = new Map<string, VitestOutRecord[]>()
  for (let name of readdirSync(folder).toSorted()) {
    files.set(
      path.basename(name, '.jsonl'),
      readOutFile(path.join(folder, name)),
    )
  }
  return files
}
