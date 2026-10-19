import type { VitestOutRecord, VitestHeartbeat } from './vitest-worker'

/**
 * What one unit of a Vitest run left behind.
 */
export interface UnitOutcome {
  /**
   * Last heartbeat of the worker the watchdog stopped, or null.
   */
  hung: VitestHeartbeat | null

  /**
   * Records the worker wrote, in order.
   */
  records: VitestOutRecord[]

  /**
   * Process id of the worker that claimed the unit, or null when no worker
   * claimed it.
   */
  pid: number | null

  /**
   * Whether a worker claimed the unit.
   */
  claimed: boolean
}
