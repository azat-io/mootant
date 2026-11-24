import { describe, expect, it, vi } from 'vitest'

import type { VitestHandle } from '../../../adapters/vitest/types/vitest-session-state'

import { runSpecifications } from '../../../adapters/vitest/run-specifications'
import { waitForWorkers } from '../../../adapters/vitest/wait-for-workers'

vi.mock(import('../../../adapters/vitest/wait-for-workers'), () => ({
  waitForWorkers: vi.fn(() => Promise.resolve()),
}))

/**
 * Creates a handle whose run reports the given unhandled errors.
 *
 * @param run - Fake `runTestSpecifications`.
 * @returns Handle with a fake Vitest instance.
 */
function createHandle(run: () => Promise<unknown>): VitestHandle {
  return {
    state: {
      pool: { drain: vi.fn(() => Promise.resolve()), prepare: vi.fn() },
    },
    vitest: { runTestSpecifications: vi.fn(run), provide: vi.fn() },
    context: { workDirectory: '/work', root: '/p' },
  } as never
}

describe('runSpecifications', () => {
  it('provides the worker options and restores the exit code', async () => {
    let handle = createHandle(() => {
      process.exitCode = 1
      return Promise.resolve({ unhandledErrors: [] })
    })
    let { exitCode } = process

    let timeouts = { file: 100, test: 50 }

    await expect(
      runSpecifications(handle, { repeat: true, mode: 'dry', timeouts }, []),
    ).resolves.toBeNull()
    expect(process.exitCode).toBe(exitCode)
    expect(handle.vitest.provide).toHaveBeenCalledWith('mootant', {
      directory: '/work',
      repeat: true,
      mode: 'dry',
      root: '/p',
      timeouts,
    })
    expect(waitForWorkers).toHaveBeenCalledWith('/work')
  })

  it('tells the workers about parallel units when the context allows them', async () => {
    let handle = createHandle(() => Promise.resolve({ unhandledErrors: [] }))
    handle.context.parallelUnits = true

    await runSpecifications(
      handle,
      { mode: 'isolated', timeouts: null, repeat: false },
      [],
    )

    expect(handle.vitest.provide).toHaveBeenCalledWith('mootant', {
      directory: '/work',
      mode: 'isolated',
      timeouts: null,
      parallel: true,
      repeat: false,
      root: '/p',
    })
  })

  it('keeps spare workers for isolated runs with parallel units only, and drains them before it waits for the workers, also after a failure', async () => {
    let specifications = [{ moduleId: '/p/a.test.ts' }] as never[]
    let handle = createHandle(() => Promise.resolve({ unhandledErrors: [] }))
    let { pool } = handle.state
    vi.mocked(pool.drain).mockImplementation(() => {
      expect(waitForWorkers).not.toHaveBeenCalled()
      return Promise.resolve()
    })
    vi.mocked(waitForWorkers).mockClear()

    await [false, true]
      .flatMap(parallelUnits =>
        (['dry', 'batch', 'isolated'] as const).map(mode => ({
          parallelUnits,
          mode,
        })),
      )
      .reduce(async (previous, { parallelUnits, mode }) => {
        await previous
        handle.context.parallelUnits = parallelUnits
        await runSpecifications(
          handle,
          { timeouts: null, repeat: false, mode },
          specifications,
        )
        vi.mocked(waitForWorkers).mockClear()
      }, Promise.resolve())

    expect(vi.mocked(pool.prepare).mock.calls).toStrictEqual([
      [[]],
      [[]],
      [[]],
      [[]],
      [[]],
      [specifications],
    ])
    expect(pool.drain).toHaveBeenCalledTimes(6)

    let failing = createHandle(() => Promise.reject(new Error('broken')))
    failing.context.parallelUnits = true

    await expect(
      runSpecifications(
        failing,
        { mode: 'isolated', timeouts: null, repeat: false },
        specifications,
      ),
    ).rejects.toThrow('broken')
    expect(failing.state.pool.prepare).toHaveBeenCalledWith(specifications)
    expect(failing.state.pool.drain).toHaveBeenCalledExactlyOnceWith()
    expect(waitForWorkers).not.toHaveBeenCalled()
  })

  it('returns the first unhandled error', async () => {
    let handle = createHandle(() =>
      Promise.resolve({
        unhandledErrors: [{ message: '[vitest-pool]: Worker exited\nstack' }],
      }),
    )

    await expect(
      runSpecifications(
        handle,
        { timeouts: null, repeat: false, mode: 'batch' },
        [],
      ),
    ).resolves.toBe('[vitest-pool]: Worker exited')
  })
})
