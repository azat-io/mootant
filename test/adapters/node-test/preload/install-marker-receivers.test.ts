import { afterEach, describe, expect, it, vi } from 'vitest'

import type { NodeTestReport } from '../../../../adapters/node-test/types/node-test-record'

import { installMarkerReceivers } from '../../../../adapters/node-test/preload/install-marker-receivers'

describe('installMarkerReceivers', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, Symbol.for('mootant.served'))
    Reflect.deleteProperty(globalThis, Symbol.for('mootant.loaded'))
    Reflect.deleteProperty(globalThis, Symbol.for('mootant.reported'))
  })

  it('puts the receivers on globalThis without listing them', () => {
    let served = vi.fn<(file: string) => void>()
    let loaded = vi.fn<() => void>()
    let reported = vi.fn<(record: NodeTestReport) => void>()
    installMarkerReceivers({ reported, served, loaded })
    let global = globalThis as Record<
      symbol,
      ((value?: unknown) => void) | undefined
    >
    global[Symbol.for('mootant.served')]?.('/a.js')
    global[Symbol.for('mootant.loaded')]?.()
    global[Symbol.for('mootant.reported')]?.({
      kind: 'todo',
      failed: true,
    })

    expect(served).toHaveBeenCalledWith('/a.js')
    expect(reported).toHaveBeenCalledWith({
      kind: 'todo',
      failed: true,
    })
    expect(loaded).toHaveBeenCalledExactlyOnceWith()
    expect(Object.keys(globalThis)).not.toContain('mootant.served')
    expect(
      Object.getOwnPropertyDescriptor(globalThis, Symbol.for('mootant.loaded'))
        ?.enumerable,
    ).toBe(false)
  })
})
