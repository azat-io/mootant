import type { NodeTestRecord } from './node-test-record'

/**
 * What a test process left behind once it ended.
 */
export interface TestProcessOutcome {
  /**
   * Records it wrote, in order; a line cut off by a stopped process is left
   * out.
   */
  records: NodeTestRecord[]

  /**
   * Signal that ended it, such as `SIGKILL`, or null.
   */
  signal: string | null

  /**
   * Exit code, or null when a signal ended it.
   */
  code: number | null

  /**
   * Whether a process of its group outlived it, or the watchdog stopped it:
   * either way what that group held, such as a port, may stay taken for a
   * moment after the group was stopped.
   */
  lingering: boolean

  /**
   * Epoch milliseconds when it was started, or got its unit as a spare.
   */
  spawned: number

  /**
   * Whether the watchdog stopped it past its deadline.
   */
  hung: boolean
}
