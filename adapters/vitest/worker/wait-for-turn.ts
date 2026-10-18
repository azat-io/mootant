import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { SafeClock } from '../../shared/types/safe-clock'

import { isProcessAlive } from './is-process-alive'

/**
 * Milliseconds between two looks at the unit before.
 */
const POLL_INTERVAL = 20

/**
 * Waits until the unit before this one of the same test file has finished, so
 * two units of one test file never run at the same time: a plain run of the
 * test runner never runs a test file twice at once, and tests may rely on it,
 * such as with a fixed file, port or database. The unit before has finished
 * when its worker process is gone: Vitest stops a worker only after its
 * teardown, worker-scoped fixture cleanup and environment teardown included, so
 * a unit never starts while the one before still holds a resource. A unit
 * before that ran in this very process has finished too. Units are claimed in
 * order, so the unit before is always claimed and its worker runs or has run.
 *
 * @param directory - Work directory of the run.
 * @param unit - The claimed unit.
 * @param unit.hash - Name of the test file in the work directory
 *   (`getFileHash`).
 * @param unit.index - Position of the unit among the file's units.
 * @param clock - Timers captured before test code could replace them.
 * @returns Resolves when the unit may start.
 */
export async function waitForTurn(
  directory: string,
  unit: { index: number; hash: string },
  clock: SafeClock,
): Promise<void> {
  if (unit.index === 0) {
    return
  }
  let name = `${unit.hash}-${unit.index - 1}`
  let pid = readFileSync(path.join(directory, 'claim', name), 'utf8')
  if (pid === String(process.pid) || !isProcessAlive(pid)) {
    return
  }
  await new Promise<void>(resolve => {
    clock.setTimeout(resolve, POLL_INTERVAL)
  })
  await waitForTurn(directory, unit, clock)
}
