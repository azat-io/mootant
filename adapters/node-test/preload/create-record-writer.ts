import { writeSync, openSync } from 'node:fs'

import type { NodeTestRecord } from '../types/node-test-record'

/**
 * Opens the out file of a test process for appending and returns a writer of
 * records. Each record is one JSON line written synchronously in one call, so a
 * process killed later keeps the records written before, and lines of the main
 * thread and of the module hooks' thread never mix. The descriptor and
 * `writeSync` are taken when the writer is made, before mootant's trackers or
 * test code could wrap `node:fs`.
 *
 * @param out - Absolute path of the out file.
 * @returns Function that appends one record.
 */
export function createRecordWriter(
  out: string,
): (record: NodeTestRecord) => void {
  let descriptor = openSync(out, 'a')
  let write = writeSync
  return record => {
    write(descriptor, `${JSON.stringify(record)}\n`)
  }
}
