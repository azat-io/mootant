import type { RunnerTestSuite, RunnerTestCase, RunnerTestFile } from 'vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { TestRunner } from 'vitest'

import { getHookBudget } from '../../../../adapters/vitest/worker/get-hook-budget'

/**
 * Hook lists of a fake suite.
 */
type Hooks = Partial<Record<string, object[]>>

/**
 * Makes `TestRunner.getSuiteHooks` return the given hooks per suite.
 *
 * @param hooks - Hook lists by suite.
 */
function mockHooks(hooks: Map<object, Hooks>): void {
  vi.spyOn(TestRunner, 'getSuiteHooks').mockImplementation(
    suite =>
      (hooks.get(suite) && {
        beforeEach: [],
        aroundEach: [],
        afterEach: [],
        beforeAll: [],
        aroundAll: [],
        afterAll: [],
        ...hooks.get(suite),
      }) as never,
  )
}

/**
 * Creates a hook with a timeout under one of Vitest's keys.
 *
 * @param key - `VITEST_CLEANUP_TIMEOUT` or `VITEST_AROUND_TIMEOUT`.
 * @param timeout - Milliseconds.
 * @returns Hook function.
 */
function createHook(key: string, timeout: number): object {
  return Object.assign(() => {}, { [Symbol.for(key)]: timeout })
}

/**
 * Hook without a timeout of its own.
 */
function plain(): void {}

describe('getHookBudget', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds the hooks around a test in its suites and file', () => {
    let file: RunnerTestFile = { type: 'suite', tasks: [] } as never
    let outer: RunnerTestSuite = { type: 'suite', file } as never
    let inner: RunnerTestSuite = {
      type: 'suite',
      suite: outer,
      file,
    } as never
    let test = { suite: inner, type: 'test', file } as RunnerTestCase
    mockHooks(
      new Map<object, Hooks>([
        [
          outer,
          {
            aroundEach: [createHook('VITEST_AROUND_TIMEOUT', 30)],
            afterEach: [plain],
            beforeAll: [plain],
          },
        ],
        [inner, { beforeEach: [createHook('VITEST_CLEANUP_TIMEOUT', 50)] }],
        [file, { afterEach: [plain] }],
      ]),
    )

    expect(getHookBudget(test, 10)).toBe(2 * 50 + 2 * 30 + 10 + 10)
  })

  it('counts a top-level test with the hooks of its file', () => {
    let file: RunnerTestFile = { type: 'suite', tasks: [] } as never
    let test = { type: 'test', file } as RunnerTestCase
    mockHooks(new Map<object, Hooks>([[file, { beforeEach: [() => {}] }]]))

    expect(getHookBudget(test, 10)).toBe(20)
  })

  it('adds the suite hooks of a file and its nested suites', () => {
    let nested: RunnerTestSuite = {
      tasks: [{ type: 'test' }],
      type: 'suite',
    } as never
    let bare: RunnerTestSuite = { type: 'suite', tasks: [] } as never
    let file: RunnerTestFile = {
      tasks: [nested, bare, { type: 'test' }],
      type: 'suite',
    } as never
    mockHooks(
      new Map<object, Hooks>([
        [
          file,
          {
            beforeAll: [createHook('VITEST_CLEANUP_TIMEOUT', 40)],
            beforeEach: [() => {}],
          },
        ],
        [
          nested,
          {
            aroundAll: [createHook('VITEST_AROUND_TIMEOUT', 5)],
            afterAll: [() => {}],
          },
        ],
      ]),
    )

    expect(getHookBudget(file, 10)).toBe(2 * 40 + 2 * 5 + 10)
  })

  it('makes the budget unlimited for a hook without a timeout', () => {
    let file: RunnerTestFile = { type: 'suite', tasks: [] } as never
    let test = { type: 'test', file } as RunnerTestCase
    mockHooks(
      new Map<object, Hooks>([
        [
          file,
          {
            aroundEach: [createHook('VITEST_AROUND_TIMEOUT', 0)],
            afterAll: [() => {}],
          },
        ],
      ]),
    )

    expect(getHookBudget(test, 10)).toBe(Infinity)
    expect(getHookBudget(file, 0)).toBe(Infinity)
  })
})
