import { writeFileSync, rmSync } from 'node:fs'

import type { JestTimedRecord } from './types/jest-timed-record'
import type { RecordReader } from './types/record-reader'
import type { UnitOutcome } from './types/unit-outcome'
import type { WorkerPool } from './types/worker-pool'
import type { JestWorker } from './types/jest-worker'
import type { WorkerSlot } from './types/worker-slot'
import type { JestUnit } from './types/jest-unit'

import { stopProcessGroup } from '../shared/stop-process-group'
import { createRecordReader } from './create-record-reader'

/**
 * Milliseconds between two reads of the out file.
 */
const WATCH_INTERVAL = 100

/**
 * What the watchdog of a unit works with.
 */
interface WatchedUnit {
  /**
   * Gives the epoch milliseconds past which the worker is stopped, from the
   * records so far and when the unit was sent.
   */
  deadline(records: readonly JestTimedRecord[], sent: number): number

  /**
   * The unit.
   */
  unit: JestUnit
}

/**
 * Runs one unit on the worker of a slot the caller holds, under a watchdog. A
 * unit that ends sooner than a tick never sees one, as waiting ends with the
 * `done` message or the exit of the worker. A unit ended when its `finish`
 * record is there: a `done` with no `finish` means the records are lost, as
 * under a left `mock-fs` or on a full disk, and an exit right after `finish`
 * lost nothing. A worker that must not run another unit leaves the slot empty
 * before this returns, so a caller's verdict on the unit discards the worker
 * that ran it. A clean attempt is what plain Jest gives a test file: a new
 * process with no limit of mootant's, used for one unit, which touches no other
 * slot.
 *
 * @param pool - Workers of the session.
 * @param slot - Slot the caller holds.
 * @param input - The unit, its deadline and what decides on its worker.
 * @param input.discardWhen - Tells from what the unit left behind whether its
 *   worker goes, unless it is a clean attempt, whose worker always goes.
 * @param input.clean - Whether this is a clean attempt.
 * @returns What the unit left behind.
 * @throws {Error} When the pool is closed, a worker cannot start or the out
 *   file cannot be made.
 */
export async function runOnWorker(
  pool: WorkerPool,
  slot: WorkerSlot,
  input: {
    discardWhen(outcome: UnitOutcome): boolean
    clean: boolean
  } & WatchedUnit,
): Promise<UnitOutcome> {
  if (input.clean) {
    await pool.discard(slot)
  }
  let outcome = await runOnSlot(pool, { input, slot })
  if (input.clean || input.discardWhen(outcome)) {
    await pool.discard(slot)
  }
  return outcome
}

/**
 * Sends a unit to a booted worker and waits for its end. A worker the watchdog
 * stopped past `finish` is no hang, as its unit ended.
 *
 * @param pool - Workers of the session.
 * @param running - Where the unit runs.
 * @param running.startup - Milliseconds the worker took to obtain.
 * @param running.reader - Reader of the out file.
 * @param running.worker - Booted worker of the slot.
 * @param running.input - The unit and its deadline.
 * @param running.slot - Slot that holds the worker.
 * @returns What the unit left behind.
 */
async function watchUnit(
  pool: WorkerPool,
  running: {
    reader: RecordReader
    input: WatchedUnit
    worker: JestWorker
    slot: WorkerSlot
    startup: number
  },
): Promise<UnitOutcome> {
  let { startup, reader, worker, input, slot } = running
  let { child } = worker
  let watch = { stopped: false }
  let answered = new Promise<{ last: boolean; signal: null; code: null }>(
    resolve => {
      /**
       * Waits for the message that says the unit ended; a test's own
       * `process.send` may say anything.
       *
       * @param message - What the worker sent.
       */
      function receive(
        message: { type?: unknown; last: boolean } | null,
      ): void {
        if (message?.type === 'done') {
          child.off('message', receive)
          resolve({ last: message.last, signal: null, code: null })
        }
      }
      child.on('message', receive)
    },
  )
  worker.file = input.unit.file
  let sent = Date.now()
  // A callback, so a closed channel cannot throw or emit; the exit tells.
  child.send({ unit: input.unit, type: 'unit' }, () => {})
  let timer = setInterval(() => {
    if (
      !watch.stopped &&
      worker.alive() &&
      Date.now() > input.deadline(reader.read(), sent)
    ) {
      watch.stopped = true
      stopProcessGroup(child.pid!)
    }
  }, WATCH_INTERVAL)
  let end = await Promise.race([answered, worker.exited])
  clearInterval(timer)
  let records = reader.read()
  let done = records.some(record => record.kind === 'finish')
  let outOfMemory = readOutOfMemory(worker)
  if (!done || watch.stopped || !('last' in end) || end.last) {
    await pool.discard(slot)
  }
  return {
    hung: watch.stopped && !done,
    signal: end.signal,
    code: end.code,
    outOfMemory,
    startup,
    records,
    done,
  }
}

/**
 * Runs a unit on the slot's worker, new or warm, with its out file there for
 * the length of the unit. Nothing reads a finished out file, and thousands of
 * units would otherwise stay on disk until the run ends.
 *
 * @param pool - Workers of the session.
 * @param running - Where the unit runs.
 * @param running.input - The unit, its deadline and whether it is a clean
 *   attempt, whose new worker gets no heap limit.
 * @param running.slot - Slot that holds the worker.
 * @returns What the unit left behind.
 */
async function runOnSlot(
  pool: WorkerPool,
  running: { input: { clean: boolean } & WatchedUnit; slot: WorkerSlot },
): Promise<UnitOutcome> {
  let { input, slot } = running
  let { out } = input.unit
  writeFileSync(out, '')
  let reader = createRecordReader(out)
  try {
    let started = Date.now()
    let worker = await pool.obtain(slot, { uncapped: input.clean })
    let startup = Date.now() - started
    if (worker === null) {
      let { signal, code } = await slot.worker!.exited
      let outOfMemory = readOutOfMemory(slot.worker!)
      await pool.discard(slot)
      return {
        hung: false,
        done: false,
        records: [],
        outOfMemory,
        startup,
        signal,
        code,
      }
    }
    return await watchUnit(pool, { startup, reader, worker, input, slot })
  } finally {
    reader.close()
    rmSync(out, { force: true })
  }
}

/**
 * Reads what a worker that ended says of its memory, before its slot is
 * emptied.
 *
 * @param worker - A worker that ended.
 * @returns Its heap limit when it ran out of memory, or null.
 */
function readOutOfMemory(worker: JestWorker): number | null {
  return worker.outOfMemory() ? worker.heapCap : null
}
