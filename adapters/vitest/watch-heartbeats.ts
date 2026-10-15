import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import type { VitestHeartbeat } from './types/vitest-worker'

/**
 * Running watchdog of one Vitest run.
 */
interface HeartbeatWatch {
  /**
   * Stops polling and waits until the reactions to hung workers finished.
   */
  stop(): Promise<void>
}

/**
 * Milliseconds between two looks at the heartbeat files.
 */
const POLL_INTERVAL = 250

/**
 * Watches the heartbeats of the workers of a run. When a heartbeat file shows a
 * new sequence number, its deadline is the time it was seen plus its budget, on
 * the main process's clock; a worker whose deadline passes without a newer beat
 * is reported once per beat. Files that vanish or are half written are read
 * again on the next poll.
 *
 * @param directory - Work directory of the session.
 * @param onHung - Reaction to a hung worker, such as stopping it.
 * @returns Watch to stop after the run.
 */
export function watchHeartbeats(
  directory: string,
  onHung: (beat: VitestHeartbeat) => Promise<void>,
): HeartbeatWatch {
  let folder = path.join(directory, 'beat')
  let seen = new Map<
    string,
    { sequence: number; deadline: number; fired: boolean }
  >()
  let reactions: Promise<void>[] = []
  let timer = setInterval(() => {
    let now = performance.now()
    for (let name of readdirSync(folder)) {
      let beat: VitestHeartbeat
      try {
        beat = JSON.parse(
          readFileSync(path.join(folder, name), 'utf8'),
        ) as VitestHeartbeat
      } catch {
        continue
      }
      let entry = seen.get(name)
      if (entry?.sequence !== beat.sequence) {
        seen.set(name, {
          deadline: now + beat.budget,
          sequence: beat.sequence,
          fired: false,
        })
      } else if (!entry.fired && now > entry.deadline) {
        entry.fired = true
        reactions.push(onHung(beat))
      }
    }
  }, POLL_INTERVAL)
  return {
    stop: async () => {
      clearInterval(timer)
      await Promise.all(reactions)
    },
  }
}
