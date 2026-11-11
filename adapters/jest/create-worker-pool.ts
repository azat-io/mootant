import type { WorkerPool } from './types/worker-pool'
import type { WorkerSlot } from './types/worker-slot'
import type { JestWorker } from './types/jest-worker'

import { stopProcessGroup } from '../shared/stop-process-group'

/**
 * Creates the pool of a session, with one rule: no live worker in the slot,
 * fork one. A slot's number is its worker's `JEST_WORKER_ID`.
 *
 * @param input - Number of slots and how to fork a worker.
 * @param input.start - Forks a worker for the slot with the given number, with
 *   no heap limit from mootant when told so.
 * @param input.size - Number of slots.
 * @returns The pool, with no worker yet.
 */
export function createWorkerPool(input: {
  start(slot: number, uncapped: boolean): JestWorker
  size: number
}): WorkerPool {
  let slots: WorkerSlot[] = Array.from(
    { length: input.size },
    (_, index): WorkerSlot => ({
      index: index + 1,
      worker: null,
      busy: false,
    }),
  )
  let closing: Promise<void> | null = null
  return {
    async obtain(slot, options) {
      if (closing !== null) {
        throw new Error('mootant closed its Jest workers; no test can run now.')
      }
      if (slot.worker?.alive() === true) {
        return slot.worker
      }
      let worker = input.start(slot.index, options.uncapped)
      slot.worker = worker
      return (await worker.ready) ? worker : null
    },
    close() {
      closing ??= (async () => {
        await Promise.all(slots.map(slot => stopWorker(slot.worker)))
      })()
      return closing
    },
    async discardAll() {
      await Promise.all(
        slots.filter(slot => !slot.busy).map(slot => emptySlot(slot)),
      )
    },
    take() {
      let slot = slots.find(entry => !entry.busy)!
      slot.busy = true
      return slot
    },
    release(slot) {
      slot.busy = false
    },
    discard: emptySlot,
    size: input.size,
  }
}

/**
 * Stops the group of a live worker and waits for its exit, which a process that
 * could not start never has.
 *
 * @param worker - The worker, if there is one.
 * @returns A promise that settles once it is gone.
 */
async function stopWorker(worker: JestWorker | null): Promise<void> {
  if (worker?.child.pid !== undefined) {
    if (worker.alive()) {
      stopProcessGroup(worker.child.pid)
    }
    await worker.exited
  }
}

/**
 * Empties a slot, stops its worker and waits for its exit.
 *
 * @param slot - Slot to empty.
 * @returns A promise that settles once the worker is gone.
 */
async function emptySlot(slot: WorkerSlot): Promise<void> {
  let { worker } = slot
  slot.worker = null
  await stopWorker(worker)
}
