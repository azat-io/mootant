import type { RunnerTestCase, RunnerTestFile } from 'vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { TestRunner } from 'vitest'

import { installTryHook } from '../../../../adapters/vitest/worker/install-try-hook'

/**
 * `aroundEach` hook as Vitest calls it.
 */
type AroundHook = (
  runTest: () => Promise<void>,
  context: { task: RunnerTestCase },
) => Promise<void>

describe('installTryHook', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds an outermost aroundEach hook without a timeout', async () => {
    let user: AroundHook = runTest => runTest()
    let hooks: { aroundEach: AroundHook[] } = { aroundEach: [user] }
    vi.spyOn(TestRunner, 'getSuiteHooks').mockReturnValue(hooks as never)
    let order: string[] = []
    let test = { id: 't' } as RunnerTestCase
    installTryHook({} as RunnerTestFile, async (started, runTest) => {
      order.push(`start ${started.id}`)
      await runTest()
      order.push('end')
    })

    expect(hooks.aroundEach).toHaveLength(2)
    expect(hooks.aroundEach[1]).toBe(user)

    let [hook] = hooks.aroundEach
    await hook!(
      () => {
        order.push('run')
        return Promise.resolve()
      },
      { task: test },
    )

    expect(order).toStrictEqual(['start t', 'run', 'end'])
    expect(Reflect.get(hook!, Symbol.for('VITEST_AROUND_TIMEOUT'))).toBe(0)
  })

  it('leaves a file without hooks alone', () => {
    vi.spyOn(TestRunner, 'getSuiteHooks').mockReturnValue(undefined as never)
    let around = vi.fn()

    expect(() => {
      installTryHook({} as RunnerTestFile, around)
    }).not.toThrow()
    expect(around).not.toHaveBeenCalled()
  })
})
