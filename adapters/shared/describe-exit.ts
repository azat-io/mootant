/**
 * Describes how a test process that did not finish its test file ended.
 *
 * @param outcome - What the process left behind.
 * @param outcome.signal - Signal that ended it, such as `SIGKILL`, or null.
 * @param outcome.code - Exit code, or null when a signal ended it.
 * @param outcome.hung - Whether the watchdog stopped it past its deadline.
 * @returns A sentence.
 */
export function describeExit(outcome: {
  signal: string | null
  code: number | null
  hung: boolean
}): string {
  if (outcome.hung) {
    return 'The test process ran past its time limit and was stopped.'
  }
  return outcome.code === null ?
      `The test process was stopped by ${outcome.signal} before the test file ended.`
    : `The test process exited with code ${outcome.code} before the test file ended.`
}
