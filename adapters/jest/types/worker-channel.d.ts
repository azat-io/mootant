import type { JestRecord } from './jest-record'
import type { JestUnit } from './jest-unit'
import type { VmSide } from './vm-side'

/**
 * The token-guarded writer of a worker's records. It lives on `process`, whose
 * copy in a test's vm holds the same object, so a leftover timer of an earlier
 * unit holds an old token and cannot write into this one.
 */
export interface WorkerChannel {
  /**
   * Appends a record with `time` to the out file when the token is the current
   * one and a file is open. Never throws: a line that fails to write stays
   * queued, in order, for the next write.
   */
  write(token: number, record: JestRecord): void

  /**
   * Raises the token, makes the unit current and writes `start`; no test code
   * runs when it throws.
   *
   * @throws {Error} When the out file does not open.
   */
  begin(unit: JestUnit): number

  /**
   * Enters the store of the test environment's calls
   * (`WorkerCalls.environment`) for what the current unit runs from here on;
   * the last setup file calls it.
   */
  enterEnvironment(): void

  /**
   * Current unit, or null before the first.
   */
  unit: JestUnit | null

  /**
   * What the vm's setup registered for the current unit, or null while it has
   * not run.
   */
  vm: VmSide | null

  /**
   * Token of the current unit.
   */
  token: number

  /**
   * Flushes what it can and closes the out file. Never throws; a later write
   * does nothing.
   */
  end(): void
}
