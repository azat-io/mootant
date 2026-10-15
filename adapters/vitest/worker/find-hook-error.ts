import type { RunnerTestSuite, RunnerTestFile } from 'vitest'

import { getErrorMessage } from './get-error-message'

/**
 * Pattern of the error Vitest adds to a file with snapshots no test checked
 * while snapshots are not updated; tests mootant skipped cause it, so it is not
 * a failure of the file.
 */
const OBSOLETE_PATTERN = /^Obsolete snapshots found/u

/**
 * Finds the first error of a file or suite itself, such as a failed `beforeAll`
 * or `afterAll` hook, which fails the file without failing a test.
 *
 * @param suite - Test file or suite after it ran.
 * @returns Message of the first error of the suite or of a nested suite, or
 *   null.
 */
export function findHookError(
  suite: RunnerTestSuite | RunnerTestFile,
): string | null {
  let error = suite.result?.errors?.find(
    entry => !OBSOLETE_PATTERN.test(entry.message),
  )
  if (error !== undefined) {
    return getErrorMessage(error)
  }
  for (let task of suite.tasks) {
    if (task.type === 'suite') {
      let nested = findHookError(task)
      if (nested !== null) {
        return nested
      }
    }
  }
  return null
}
