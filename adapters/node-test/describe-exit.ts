import type { TestProcessOutcome } from './types/test-process-outcome'

/**
 * Describes how a test process that did not finish its test file ended.
 *
 * @param outcome - What the process left behind.
 * @returns A sentence.
 */
export function describeExit(
  outcome: Pick<TestProcessOutcome, 'signal' | 'code' | 'hung'>,
): string {
  if (outcome.hung) {
    return 'The test process ran past its time limit and was stopped.'
  }
  return outcome.code === null ?
      `The test process was stopped by ${outcome.signal} before the test file ended.`
    : `The test process exited with code ${outcome.code} before the test file ended.`
}
