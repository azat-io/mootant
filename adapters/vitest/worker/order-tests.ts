import type { RunnerTestSuite, RunnerTestFile } from 'vitest'

/**
 * Keeps the suites and tests of a file in file order, and with `sequential`
 * makes them run one after another: a batch run switches the active mutant
 * between tries, which must not overlap, and fast mode plans from a dry run in
 * that order. Without it, tests the user marked concurrent stay concurrent, as
 * in a plain run. Vitest reads these flags when it runs a suite, so they can be
 * changed after collection.
 *
 * @param suite - Collected test file or suite.
 * @param sequential - Whether concurrent suites and tests run one at a time.
 * @returns Whether a suite or test of it was marked concurrent.
 */
export function orderTests(
  suite: RunnerTestSuite | RunnerTestFile,
  sequential: boolean,
): boolean {
  let concurrent = suite.concurrent === true
  suite.shuffle = false
  for (let task of suite.tasks) {
    if (task.type === 'suite') {
      concurrent = orderTests(task, sequential) || concurrent
    } else {
      concurrent ||= task.concurrent === true
      if (sequential) {
        task.concurrent = false
      }
    }
  }
  if (sequential) {
    suite.concurrent = false
  }
  return concurrent
}
