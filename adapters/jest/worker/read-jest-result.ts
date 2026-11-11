import type { JestFileResult } from '../types/jest-file-result'
import type { JestFileFacts } from '../types/jest-file-facts'

/**
 * Jest's own words for a test file without tests: `TestRunner` lacks the check
 * of the scheduler that says them.
 */
const NO_TESTS = 'Your test suite must contain at least one test.'

/**
 * Reads what the `finish` record of a unit takes from a test file that gave a
 * result. An error outside any test is read from the `stack` of
 * `testExecError`, since its `message` is empty on Jest 29 and 30.
 *
 * @param result - What Jest gave for the test file.
 * @returns The facts of the file, with `empty` for a file without tests.
 */
export function readJestResult(result: JestFileResult): JestFileFacts {
  let { failureMessage = null, testExecError, testResults, snapshot } = result
  let empty = testResults.length === 0 && !testExecError
  return {
    lines: Object.fromEntries(
      testResults.flatMap(({ ancestorTitles, location, title }) =>
        location ?
          [[[...ancestorTitles, title].join(' > '), location.line]]
        : [],
      ),
    ),
    snapshots:
      snapshot.unchecked + snapshot.unmatched + (snapshot.fileDeleted ? 1 : 0),
    execError: testExecError ? testExecError.stack.split('\n', 1)[0]! : null,
    outcome: empty ? 'empty' : 'result',
    message: empty ? NO_TESTS : null,
    failureMessage,
    realm: null,
  }
}
