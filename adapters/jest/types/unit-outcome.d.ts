import type { JestTimedRecord } from './jest-timed-record'

/**
 * What a unit left behind on a worker.
 */
export interface UnitOutcome {
  /**
   * Records of its out file.
   */
  records: JestTimedRecord[]

  /**
   * Heap limit of a worker that ran out of memory, in megabytes, or null: it
   * ended another way, or it had no limit from mootant.
   */
  outOfMemory: number | null

  /**
   * Signal that ended the worker, or null when it exited with a code or said
   * the unit ended.
   */
  signal: string | null

  /**
   * Exit code of the worker, or null when a signal ended it or it said the unit
   * ended; with `signal` null too and no `done`, it said so and its records are
   * lost.
   */
  code: number | null

  /**
   * Milliseconds the pool took to give it a worker, about 0 for a warm one.
   */
  startup: number

  /**
   * Whether the watchdog stopped the worker before the unit ended.
   */
  hung: boolean

  /**
   * Whether the unit ended, which is whether its `finish` record is there,
   * whatever the worker said or did after it.
   */
  done: boolean
}
