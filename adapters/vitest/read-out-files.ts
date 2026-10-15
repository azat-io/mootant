import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import type { VitestOutRecord } from './types/vitest-worker'

/**
 * Reads the records workers wrote in a run. A line cut off by a stopped worker
 * is ignored.
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
    let records: VitestOutRecord[] = []
    let lines = readFileSync(path.join(folder, name), 'utf8').split('\n')
    for (let line of lines) {
      try {
        records.push(JSON.parse(line) as VitestOutRecord)
      } catch {
        continue
      }
    }
    files.set(path.basename(name, '.jsonl'), records)
  }
  return files
}
