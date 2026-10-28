import type { TestProcessOutcome } from './types/test-process-outcome'
import type { DryFile } from '../../types/adapter/dry-file'
import type { DryTest } from '../../types/adapter/dry-test'
import type { NodeTestUnit } from './types/node-test-unit'

import { describeHookFailure } from './describe-hook-failure'
import { listRunningTries } from './list-running-tries'
import { dropTodoErrors } from './drop-todo-errors'
import { listFileErrors } from './list-file-errors'
import { describeExit } from './describe-exit'
import { getTestId } from './get-test-id'
import { readTries } from './read-tries'

/**
 * What the dry run of one test file reported.
 */
interface DryFileReport {
  /**
   * Test that ran when the watchdog stopped the process, or null.
   */
  hung: { name: string | null; test: string | null } | null

  /**
   * Tests that failed in a process that still exited with 0, for isolated units
   * of the file.
   */
  expected: NodeTestUnit['expected']

  /**
   * Tests of the file with their one try each, in the order they started.
   */
  tests: DryTest[]

  /**
   * The test file.
   */
  entry: DryFile
}

/**
 * Builds the dry-run report of a test file from what its process left behind.
 * The file failed to load when an error stopped its loading, when the process
 * did not reach its end (stopped by the watchdog or a signal, or exiting
 * early), or when the process failed with no failed test: an unhandled error
 * outside tests, a failed suite hook or teardown, or a failed root hook, which
 * mootant's reporter records since plain `node` exits with 0 after it from Node
 * 22 on (`describeHookFailure`). The uncaught errors that count against the
 * file are its errors (`listFileErrors`). Uncaught errors that node:test gave
 * to a todo test count nowhere (`dropTodoErrors`). Dependencies are left for
 * the caller.
 *
 * @param outcome - What the process left behind.
 * @param input - Test file and project root.
 * @param input.root - Project root.
 * @param input.file - Absolute path of the test file.
 * @returns The test file, its tests, its expected failures and its hang.
 */
export function buildDryFile(
  outcome: TestProcessOutcome,
  input: { root: string; file: string },
): DryFileReport {
  let records = dropTodoErrors(outcome.records)
  let { root, file } = input
  let tries = readTries(records, {
    passed: outcome.code === 0,
    mutant: null,
    root,
    file,
  })
  let end = records.find(record => record.kind === 'end')
  let hook = records.find(record => record.kind === 'root-hook')
  let fileErrors = listFileErrors(records)
  let errors = fileErrors.map(entry => entry.message)
  let loadErrors = fileErrors.filter(entry => entry.load).length
  let failed = tries.some(entry => entry.facts.failed)
  let loadFailed = outcome.hung || end === undefined || loadErrors > 0
  if (end === undefined || outcome.hung) {
    if (loadErrors === 0) {
      errors.push(describeExit(outcome))
    }
  } else if (!failed && (hook !== undefined || outcome.code !== 0)) {
    loadFailed = true
    if (errors.length === 0) {
      errors.push(describeHookFailure(outcome, hook))
    }
  }
  return {
    entry: {
      ...(end !== undefined && {
        environment: end.environment,
        modified: end.modified,
      }),
      loadDuration: end?.loadDuration ?? 0,
      hookDuration: end?.hookDuration ?? 0,
      concurrent: end?.concurrent ?? false,
      covers: end?.covers ?? [],
      hits: end?.hits ?? 0,
      project: '',
      loadFailed,
      errors,
      file,
    },
    tests: tries.map(entry => ({
      id: entry.facts.test,
      tries: [entry.facts],
      name: entry.name,
      project: '',
      line: null,
      file,
    })),
    expected: tries
      .filter(entry => entry.expected)
      .map(({ occurrence, name }) => ({ occurrence, name })),
    hung: outcome.hung ? findRunningTest(outcome, input) : null,
  }
}

/**
 * Finds the test that ran last in a process the watchdog stopped: the last of
 * the tries that still ran (`listRunningTries`).
 *
 * @param outcome - What the process left behind.
 * @param input - Test file and project root.
 * @param input.root - Project root.
 * @param input.file - Absolute path of the test file.
 * @returns Id and full name of the test, or nulls outside tests.
 */
function findRunningTest(
  outcome: TestProcessOutcome,
  input: { root: string; file: string },
): { name: string | null; test: string | null } {
  let last = listRunningTries(outcome.records).at(-1)
  return last === undefined ?
      { name: null, test: null }
    : { test: getTestId(input.root, input.file, last), name: last.name }
}
