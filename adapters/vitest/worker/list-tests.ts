import type { RunnerTestSuite, RunnerTestCase, RunnerTestFile } from 'vitest'

/**
 * Lists the tests of a collected file or suite in the order they run.
 *
 * @param suite - Collected test file or suite.
 * @returns Tests of the suite and of its nested suites, in file order.
 */
export function listTests(
  suite: RunnerTestSuite | RunnerTestFile,
): RunnerTestCase[] {
  return suite.tasks.flatMap(task =>
    task.type === 'suite' ? listTests(task) : [task],
  )
}
