import type { ProcessWatch } from './types/process-watch'

import { listRunningTries } from './list-running-tries'

/**
 * Computes the deadline of a dry-run test process: the test budget after the
 * last record while a try runs (`listRunningTries`), else the file budget, for
 * loading and for the work between tries. Every record counts as a heartbeat.
 * Both budgets grow by the `--test-timeout` of the project, the own timeout of
 * tests and suites that mootant can see.
 *
 * @param watch - Records so far and when the last one came.
 * @param timeouts - Budgets of the dry run (`DryRunRequest.timeouts`).
 * @param testTimeout - Milliseconds of `--test-timeout`, or 0 without it.
 * @returns Epoch milliseconds, or `Infinity`.
 */
export function getDryDeadline(
  watch: ProcessWatch,
  timeouts: { test: number; file: number },
  testTimeout: number,
): number {
  let running = listRunningTries(watch.records)
  return (
    watch.last +
    testTimeout +
    (running.length > 0 ? timeouts.test : timeouts.file)
  )
}
