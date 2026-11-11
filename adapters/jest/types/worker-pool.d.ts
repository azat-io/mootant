import type { JestWorker } from './jest-worker'
import type { WorkerSlot } from './worker-slot'

/**
 * Slots of the workers of a session, with one rule: no live worker in the slot,
 * fork one.
 */
export interface WorkerPool {
  /**
   * Gives the slot's live worker, or a new one once it booted; null when it did
   * not boot, with the worker left in the slot for its exit.
   *
   * @param slot - Slot to give a worker of.
   * @param options - What a new worker is like.
   * @param options.uncapped - Whether it gets no heap limit from mootant.
   * @throws {Error} When the pool is closed, or the process cannot start.
   */
  obtain(
    slot: WorkerSlot,
    options: { uncapped: boolean },
  ): Promise<JestWorker | null>

  /**
   * Stops the group of the slot's worker, if any, waits for its exit and
   * empties the slot.
   */
  discard(slot: WorkerSlot): Promise<void>

  /**
   * Frees a slot.
   */
  release(slot: WorkerSlot): void

  /**
   * Stops the group of the worker of every idle slot, waits for their exits and
   * empties those slots. Called only when no unit runs.
   */
  discardAll(): Promise<void>

  /**
   * Closes the pool, stops every live group and waits for their exits. Returns
   * one promise, which never rejects.
   */
  close(): Promise<void>

  /**
   * Takes a free slot; `runInPool` with the pool's size guarantees there is
   * one.
   */
  take(): WorkerSlot

  /**
   * Number of slots.
   */
  size: number
}
