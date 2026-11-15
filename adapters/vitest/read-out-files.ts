import type { Vitest } from 'vitest/node'

import { readdirSync } from 'node:fs'
import path from 'node:path'

import type { StrayDecisions } from './types/stray-decisions'
import type { VitestOutRecord } from './types/vitest-worker'

import { readOutRecords } from './read-out-records'

/**
 * Reads the records workers wrote in a run (`readOutRecords`).
 *
 * @param vitest - Vitest instance of the session.
 * @param directory - Work directory of the session.
 * @param decisions - Decisions of the unhandled errors of the run, which
 *   receives the new ones.
 * @returns Records of each out file in the order they were written, by file
 *   name without the extension (`<hash>-<n>`).
 */
export function readOutFiles(
  vitest: Vitest,
  directory: string,
  decisions: StrayDecisions,
): Map<string, VitestOutRecord[]> {
  let folder = path.join(directory, 'out')
  let files = new Map<string, VitestOutRecord[]>()
  for (let name of readdirSync(folder).toSorted()) {
    files.set(
      path.basename(name, '.jsonl'),
      readOutRecords(vitest, path.join(folder, name), decisions),
    )
  }
  return files
}
