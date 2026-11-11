import type { JestRecord } from './jest-record'

/**
 * One line of the out file of a unit as main reads it, with `time`, the epoch
 * milliseconds the channel stamped on it.
 */
export type JestTimedRecord = { time: number } & JestRecord
