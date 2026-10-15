import type { RunnerTestSuite, RunnerTestCase, RunnerTestFile } from 'vitest'

import { TestRunner } from 'vitest'

/**
 * Hook lists of a suite as Vitest keeps them.
 */
type SuiteHooks = ReturnType<typeof TestRunner.getSuiteHooks>

/**
 * Key of the timeout Vitest keeps on `beforeAll` and `beforeEach` hooks for
 * their cleanup.
 */
const CLEANUP_TIMEOUT = Symbol.for('VITEST_CLEANUP_TIMEOUT')

/**
 * Key of the timeout Vitest keeps on `aroundAll` and `aroundEach` hooks.
 */
const AROUND_TIMEOUT = Symbol.for('VITEST_AROUND_TIMEOUT')

/**
 * Hooks that run around every test, with the number of timed phases of each: a
 * `before` hook and its cleanup, an `around` hook's setup and teardown.
 */
const EACH_HOOKS = [
  ['beforeEach', 2],
  ['aroundEach', 2],
  ['afterEach', 1],
] as const

/**
 * Hooks that run once per suite, with the number of timed phases of each.
 */
const ALL_HOOKS = [
  ['beforeAll', 2],
  ['aroundAll', 2],
  ['afterAll', 1],
] as const

/**
 * Adds up the time Vitest's own hook timeouts allow, for the watchdog of a dry
 * run. For a test: every `beforeEach`, `aroundEach` and `afterEach` hook of its
 * suites and of its file (a top-level test has no suite). For a test file:
 * every `beforeAll`, `aroundAll` and `afterAll` hook of the file and its
 * suites. A hook counts with its own timeout when Vitest keeps it, else with
 * `hookTimeout`; a `before` or `around` hook counts twice, for its cleanup or
 * teardown. A hook without a timeout (0) makes the budget unlimited, as Vitest
 * does not stop it either.
 *
 * @param task - Collected test, or collected test file.
 * @param hookTimeout - Project's `hookTimeout` in milliseconds.
 * @returns Milliseconds, or `Infinity`.
 */
export function getHookBudget(
  task: RunnerTestCase | RunnerTestFile,
  hookTimeout: number,
): number {
  let suites: (RunnerTestSuite | RunnerTestFile)[]
  if (task.type === 'test') {
    suites = []
    let { suite } = task
    while (suite !== undefined) {
      suites.push(suite)
      ;({ suite } = suite)
    }
    suites.push(task.file)
  } else {
    suites = listSuites(task)
  }
  let kinds = task.type === 'test' ? EACH_HOOKS : ALL_HOOKS
  let budget = 0
  for (let suite of suites) {
    let hooks = TestRunner.getSuiteHooks(suite) as SuiteHooks | undefined
    if (hooks === undefined) {
      continue
    }
    for (let [kind, phases] of kinds) {
      let list = hooks[kind] as object[]
      for (let hook of list) {
        budget += phases * getTimeout(hook, hookTimeout)
      }
    }
  }
  return budget
}

/**
 * Reads the timeout of one hook.
 *
 * @param hook - Hook function as Vitest registered it.
 * @param hookTimeout - Project's `hookTimeout`.
 * @returns Milliseconds, or `Infinity` for a hook without a timeout.
 */
function getTimeout(hook: object, hookTimeout: number): number {
  let own =
    (Reflect.get(hook, CLEANUP_TIMEOUT) as unknown) ??
    (Reflect.get(hook, AROUND_TIMEOUT) as unknown)
  let timeout = typeof own === 'number' ? own : hookTimeout
  return timeout > 0 ? timeout : Infinity
}

/**
 * Lists a suite and every suite nested in it.
 *
 * @param suite - Test file or suite.
 * @returns The suite first, then its nested suites in file order.
 */
function listSuites(
  suite: RunnerTestSuite | RunnerTestFile,
): (RunnerTestSuite | RunnerTestFile)[] {
  return [
    suite,
    ...suite.tasks.flatMap(task =>
      task.type === 'suite' ? listSuites(task) : [],
    ),
  ]
}
