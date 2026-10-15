import type { RunnerTestCase, RunnerTestFile, TestContext } from 'vitest'

import { TestRunner } from 'vitest'

/**
 * Key Vitest reads the timeout of an `aroundEach` hook from; 0 sets no timer.
 */
const AROUND_TIMEOUT = Symbol.for('VITEST_AROUND_TIMEOUT')

/**
 * Adds an `aroundEach` hook to a collected test file, ahead of every hook of
 * the file and of its suites, so it is the outermost one: Vitest calls it at
 * the start of every try of every test, before any `aroundEach` setup, and it
 * resumes after every inner `aroundEach` teardown. Only the cleanup of
 * `aroundEach` fixtures and the flip of a test expected to fail come after it,
 * so the try is complete by the time the next try starts. The hook has no
 * timeout of its own. A file that failed to collect has no hooks and runs no
 * tests, so it gets none.
 *
 * @param file - Collected test file.
 * @param around - Wraps each try: gets its test and the function that runs the
 *   inner hooks and the test.
 */
export function installTryHook(
  file: RunnerTestFile,
  around: (test: RunnerTestCase, runTest: () => Promise<void>) => Promise<void>,
): void {
  let hooks = TestRunner.getSuiteHooks(file) as
    ReturnType<typeof TestRunner.getSuiteHooks> | undefined
  if (hooks === undefined) {
    return
  }
  /**
   * Passes the try to the runner.
   *
   * @param runTest - Runs the inner hooks and the test.
   * @param context - Context of the test, with the test as `task`.
   * @returns Promise that settles when the try and its inner hooks ended.
   */
  function aroundTry(
    runTest: () => Promise<void>,
    context: TestContext,
  ): Promise<void> {
    return around(context.task, runTest)
  }
  hooks.aroundEach.unshift(Object.assign(aroundTry, { [AROUND_TIMEOUT]: 0 }))
}
