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
