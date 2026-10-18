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
   * Epoch milliseconds when it was started.
   */
  spawned: number

  /**
   * Whether the watchdog stopped it past its deadline.
   */
  hung: boolean
}
