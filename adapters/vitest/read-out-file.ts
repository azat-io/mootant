import { readFileSync } from 'node:fs'

import type { VitestOutRecord } from './types/vitest-worker'

/**
 * Reads the records a worker wrote in one out file. A line cut off by a stopped
 * worker is ignored.
 *
 * @param file - Absolute path of the out file.
 * @returns Records in the order they were written.
 */
export function readOutFile(file: string): VitestOutRecord[] {
  let records: VitestOutRecord[] = []
  for (let line of readFileSync(file, 'utf8').split('\n')) {
    try {
      records.push(JSON.parse(line) as VitestOutRecord)
    } catch {
      continue
    }
  }
  return records
}
