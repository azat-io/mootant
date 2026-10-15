import { readFileSync, readdirSync } from 'node:fs'
import { setInterval } from 'node:timers/promises'
import path from 'node:path'

import type { VitestHeartbeat } from './types/vitest-worker'

import { isProcessAlive } from './worker/is-process-alive'
import { stopHungWorker } from './stop-hung-worker'

/**
 * Milliseconds between two looks at the workers of the run.
 */
const POLL_INTERVAL = 10

/**
 * Milliseconds to wait at most for workers without a pending heartbeat: past
 * Vitest's own limit for stopping a worker, after which Vitest stops waiting
 * for it but leaves its process running.
 */
const WAIT_LIMIT = 70_000

/**
 * Milliseconds a pending heartbeat keeps the wait going past its budget: time
 * for the watchdog to notice the missed beat and stop the worker.
 */
const BEAT_GRACE = 5000

/**
 * Waits until every worker of the run is gone. Vitest ends a run as soon as its
 * workers reported their files, and stops them afterwards: worker-scoped
 * fixtures are cleaned up and the environment torn down only then, and a unit
 * records its end only after both. So the results of a run are read, and the
 * next run starts, once its workers exited. Every worker writes its process id
 * to `worker/<pid>` when it starts.
 *
 * A worker whose unit has not ended still has its heartbeat file, and the
 * watchdog of the run stops it once its budget passes. So the wait goes on
 * while a live worker's beat is within its budget plus a grace, however long
 * that is, and the watchdog must run until the wait is over. A beat file that
 * cannot be read, such as one being written, is read again on the next look and
 * counts as a beat without budget until then. Workers still alive past the
 * limit and without such a beat are stopped, so no worker outlives the run.
 *
 * @param directory - Work directory of the session.
 * @param limits - Milliseconds to wait at most without a pending heartbeat and
 *   past the budget of one.
 * @param limits.wait - Milliseconds to wait at most without a pending beat.
 * @param limits.grace - Milliseconds a beat keeps the wait going past its
 *   budget.
 * @returns Resolves when every worker is gone or was stopped.
 * @throws {Error} When the folders of the run cannot be read or a worker cannot
 *   be stopped.
 */
export async function waitForWorkers(
  directory: string,
  limits: { grace: number; wait: number } = {
    grace: BEAT_GRACE,
    wait: WAIT_LIMIT,
  },
): Promise<void> {
  let workers = path.join(directory, 'worker')
  let beats = path.join(directory, 'beat')
  let deadline = performance.now() + limits.wait
  let seen = new Map<string, { sequence: number; deadline: number }>()
  /**
   * Looks at the workers and their beats once.
   *
   * @returns Workers to stop, or null to look again later. An empty list means
   *   every worker is gone.
   */
  function look(): string[] | null {
    let now = performance.now()
    let alive = readdirSync(workers).filter(pid => isProcessAlive(pid))
    if (alive.length === 0) {
      return alive
    }
    let pending = false
    for (let name of readdirSync(beats)) {
      let beat: Pick<VitestHeartbeat, 'sequence' | 'budget'>
      try {
        beat = JSON.parse(
          readFileSync(path.join(beats, name), 'utf8'),
        ) as VitestHeartbeat
      } catch {
        beat = { sequence: -1, budget: 0 }
      }
      let entry = seen.get(name)
      if (entry?.sequence !== beat.sequence) {
        entry = {
          deadline: now + beat.budget + limits.grace,
          sequence: beat.sequence,
        }
        seen.set(name, entry)
      }
      if (
        alive.includes(path.basename(name, '.json')) &&
        now < entry.deadline
      ) {
        pending = true
      }
    }
    return pending || now < deadline ? null : alive
  }
  let leftover = look()
  if (leftover === null) {
    for await (let _tick of setInterval(POLL_INTERVAL)) {
      leftover = look()
      if (leftover !== null) {
        break
      }
    }
  }
  await Promise.all(leftover!.map(pid => stopHungWorker(Number(pid))))
}
