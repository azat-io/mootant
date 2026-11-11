import type { ChildProcess } from 'node:child_process'

import { trackProcessGroup } from '../shared/track-process-group'
import { stopProcessGroup } from '../shared/stop-process-group'

/**
 * Milliseconds to wait for the output of a Jest process to close after it
 * exited, before a process that still holds it, such as a detached one the
 * project started, is left behind.
 */
const CLOSE_GRACE = 300

/**
 * Watches a detached Jest process, the leader of a process group: mootant stops
 * the group if it ends first (`trackProcessGroup`), and what is left of the
 * group is stopped when the process exits.
 *
 * @param child - The process, just started.
 * @returns How it ended, once its output closed or the grace passed. Never
 *   settles for a process that could not start.
 */
export function waitForJestExit(child: ChildProcess): Promise<{
  signal: NodeJS.Signals | null
  code: number | null
  how: string
}> {
  return new Promise(resolve => {
    let { pid } = child
    if (pid !== undefined) {
      let untrack = trackProcessGroup(pid)
      child.once('exit', (code, signal) => {
        stopProcessGroup(pid)
        untrack()
        let how =
          code === null ?
            `was stopped by ${signal}`
          : `exited with code ${code}`
        let grace = setTimeout(() => {
          child.stdout?.destroy()
          child.stderr?.destroy()
          resolve({ signal, code, how })
        }, CLOSE_GRACE)
        child.once('close', () => {
          clearTimeout(grace)
          resolve({ signal, code, how })
        })
      })
    }
  })
}
