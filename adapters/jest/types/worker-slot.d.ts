import type { JestWorker } from './jest-worker'

/**
 * Place of one worker in a pool.
 */
export interface WorkerSlot {
  /**
   * Worker of the slot, live or not, or null.
   */
  worker: JestWorker | null

  /**
   * Number of the slot, from 1, which is the `JEST_WORKER_ID` of its worker.
   */
  index: number

  /**
   * Whether a caller holds the slot.
   */
  busy: boolean
}
