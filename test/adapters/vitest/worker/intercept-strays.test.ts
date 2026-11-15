import { describe, expect, it, vi } from 'vitest'

import { interceptStrays } from '../../../../adapters/vitest/worker/intercept-strays'

describe('interceptStrays', () => {
  it('sends the unhandled errors Vitest reports to the latest receiver and passes other calls through', () => {
    let onUnhandledError = vi.fn()
    let onCollected = vi.fn()
    let rpc = { onUnhandledError, onCollected }
    let state = { rpc: rpc as object }
    let first = vi.fn<(error: unknown, type: string) => void>()
    let second = vi.fn<(error: unknown, type: string) => void>()
    interceptStrays(state, first)
    let wrapped = state.rpc
    interceptStrays(state, second)
    let error = { message: 'boom' }
    ;(state.rpc as typeof rpc).onUnhandledError(error, 'Uncaught Exception')
    ;(state.rpc as typeof rpc).onCollected('files')

    expect(state.rpc).toBe(wrapped)
    expect(second).toHaveBeenCalledExactlyOnceWith(error, 'Uncaught Exception')
    expect(onCollected).toHaveBeenCalledExactlyOnceWith('files')
    expect(onUnhandledError).not.toHaveBeenCalled()
    expect(first).not.toHaveBeenCalled()
  })
})
