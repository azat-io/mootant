import type { NodeTestRecord } from './node-test-record'

/**
 * What the main process knows of a running test process, from which a watchdog
 * decides its deadline.
 */
export interface ProcessWatch {
  /**
   * Records the process wrote so far, in order.
   */
  records: NodeTestRecord[]

  /**
   * Epoch milliseconds when the process was started.
   */
  spawned: number

  /**
   * Epoch milliseconds when the last record arrived, or when the process was
   * started before any did.
   */
  last: number
}
