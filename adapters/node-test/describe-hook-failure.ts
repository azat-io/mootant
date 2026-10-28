import type { TestProcessOutcome } from './types/test-process-outcome'

/**
 * Describes how a test file whose process reached its end failed outside its
 * tests: in a root hook, which mootant's reporter records, or elsewhere, as in
 * a suite hook or teardown, which only the exit shows.
 *
 * @param outcome - What the process left behind.
 * @param hook - The failed root hook, or undefined.
 * @param hook.message - First line of the hook's error.
 * @returns A sentence.
 */
export function describeHookFailure(
  outcome: Pick<TestProcessOutcome, 'signal' | 'code'>,
  hook: { message: string } | undefined,
): string {
  return hook === undefined ?
      `The test file failed outside its tests (exit code ${outcome.code ?? outcome.signal}).`
    : `A root hook of the test file failed: ${hook.message}`
}
