import { closeSync, fstatSync, openSync, readSync } from 'node:fs'

import type { JestTimedRecord } from './types/jest-timed-record'
import type { RecordReader } from './types/record-reader'

/**
 * Opens the out file of a unit for reading. Reading through a descriptor goes
 * on after a test removed the temporary tree, so a tick of the watchdog cannot
 * throw an uncaught exception, and parsing only what was appended keeps a large
 * out file from being parsed anew at every tick. A torn last line stays in the
 * file until it is whole; a whole line that is not JSON, as a write the disk
 * cut short, is left out.
 *
 * @param file - Absolute path of the out file, which exists.
 * @returns A reader that starts at the top of the file.
 * @throws {Error} When the file does not open.
 */
export function createRecordReader(file: string): RecordReader {
  let descriptor = openSync(file, 'r')
  let records: JestTimedRecord[] = []
  let position = 0
  return {
    read() {
      let { size } = fstatSync(descriptor)
      if (size > position) {
        let buffer = Buffer.alloc(size - position)
        readSync(descriptor, buffer, 0, buffer.length, position)
        let whole = buffer.subarray(0, buffer.lastIndexOf('\n') + 1)
        position += whole.length
        for (let line of whole.toString('utf8').split('\n')) {
          try {
            records.push(JSON.parse(line) as JestTimedRecord)
          } catch {
            continue
          }
        }
      }
      return records
    },
    close() {
      closeSync(descriptor)
    },
  }
}
