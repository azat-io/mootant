import type { ProcessWatch } from './types/process-watch'

/**
 * Milliseconds a test process may take to start mootant's preload, on top of
 * the unit's timeout, before its `start` record arrives.
 */
const STARTUP_ALLOWANCE = 10_000

/**
 * Computes the deadline of an isolated unit: its timeout from the moment the
 * preload got the unit (`start` record), so the time the process takes to
 * start, or a spare waited, is not counted; before that record, the timeout
 * plus ten seconds from the start of the process, or from the moment a spare
 * got its unit, so a process that hangs before the preload runs, as in a module
 * another flag loads first, is stopped too.
 *
 * @param watch - Records so far and when the process started or got its unit.
 * @param timeout - Milliseconds the unit may take (`IsolatedUnit.limits`).
 * @returns Epoch milliseconds, or `Infinity`.
 */
export function getUnitDeadline(watch: ProcessWatch, timeout: number): number {
  let start = watch.records.find(record => record.kind === 'start')
  return start === undefined ?
      watch.spawned + timeout + STARTUP_ALLOWANCE
    : start.time + timeout
}
