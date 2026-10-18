import type { TestEvent } from 'node:test/reporters'

import type { NodeTestReport } from '../types/node-test-record'

import { getErrorMessage } from '../../shared/get-error-message'

/**
 * Record of mootant's reporter with the error of its test, which only the
 * process that ran the test can compare.
 */
interface ReadReport {
  /**
   * The record.
   */
  record: NodeTestReport

  /**
   * Error node:test reported for the test, the same object its context holds,
   * or undefined for a test that passed.
   */
  error: unknown
}

/**
 * Creates the reader of the records of mootant's reporter from the events of
 * node:test, in the order node:test reports them: a test's `test:start` before
 * those of its subtests and suite members, their ends before its own. A failure
 * of the root test, which node:test names after the test file and fails only
 * for its own hooks, is a failed root hook, with the message of the error the
 * hook threw. A todo test or suite, or one marked with `t.todo()`, passed or
 * failed, is a todo record, unless it failed with a failed subtest or suite
 * member that is not todo itself, whose failure fails the run, as Node 20 and
 * 22.12 report those of a todo test or suite, which later versions mark todo
 * too. A failed test or suite that is not todo, which fails the run, as a suite
 * whose hook failed, is a failure record. Other events give none.
 *
 * @returns Reader of one event, which returns the record and the error of its
 *   test, or null.
 */
export function createReportReader(): (event: TestEvent) => ReadReport | null {
  let failedBelow: boolean[] = []
  return event => {
    if (event.type === 'test:start') {
      failedBelow = [...failedBelow.slice(0, event.data.nesting), false]
      return null
    }
    if (event.type !== 'test:fail' && event.type !== 'test:pass') {
      return null
    }
    let { nesting, todo, name, file } = event.data
    let marked = todo !== undefined && todo !== false
    if (event.type === 'test:pass') {
      return marked ?
          { record: { failed: false, kind: 'todo' }, error: undefined }
        : null
    }
    let { error } = event.data.details
    if (nesting === 0 && name === file) {
      return {
        record: {
          message: getErrorMessage(error.cause ?? error),
          kind: 'root-hook',
        },
        error,
      }
    }
    if (!marked) {
      failedBelow = failedBelow.map(
        (failed, level) => failed || level < nesting,
      )
      return { record: { kind: 'failure' }, error }
    }
    if (failedBelow[nesting] === true) {
      return null
    }
    return { record: { kind: 'todo', failed: true }, error }
  }
}
