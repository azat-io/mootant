import { writeSync } from 'node:fs'

import type { VitestOutRecord } from '../types/vitest-worker'

/**
 * Appends one record to the out file of a unit through its open descriptor. The
 * write is synchronous, so a worker killed later loses only the test in
 * flight.
 *
 * @param descriptor - File descriptor of the out file, open for appending.
 * @param record - Record to append as one JSON line.
 */
export function writeOutRecord(
  descriptor: number,
  record: VitestOutRecord,
): void {
  writeSync(descriptor, `${JSON.stringify(record)}\n`)
}
