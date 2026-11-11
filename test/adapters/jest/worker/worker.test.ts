import { AsyncLocalStorage } from 'node:async_hooks'
import { stripTypeScriptTypes } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

import { bootWorker } from '../../../../adapters/jest/worker/boot-worker'

vi.mock(import('../../../../adapters/jest/worker/boot-worker'), () => ({
  bootWorker: vi.fn<() => void>(),
}))

describe('worker', () => {
  it('boots with the real objects', async () => {
    await import('../../../../adapters/jest/worker/worker')
    let [input] = vi.mocked(bootWorker).mock.lastCall!

    expect(input.stores).toBe(AsyncLocalStorage.prototype)
    expect(input.stripTypes).toBe(stripTypeScriptTypes)
    expect(input.global).toBe(globalThis)
    expect(input.process).toBe(process)
    expect(vi.mocked(bootWorker).mock.calls).toHaveLength(1)
  })
})
