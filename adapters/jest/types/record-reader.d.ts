import type { JestTimedRecord } from './jest-timed-record'

/**
 * What reads the out file of a unit.
 */
export interface RecordReader {
  /**
   * Gives the records so far, the one list that keeps growing, after parsing
   * what was appended since the last read.
   */
  read(): JestTimedRecord[]

  /**
   * Closes the file, which no later read can get through.
   */
  close(): void
}
