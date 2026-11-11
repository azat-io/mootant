import { describe, expect, it, vi } from 'vitest'

import { trackStores } from '../../../../adapters/jest/worker/track-stores'

/**
 * Creates a prototype in the shape of `AsyncLocalStorage.prototype` on Node 22.
 *
 * @returns The prototype and what it recorded.
 */
function createPrototype(): {
  prototype: {
    _enable(...parameters: unknown[]): unknown
    disable(): void
  }
  enabled: unknown[][]
  disabled: unknown[]
} {
  let disabled: unknown[] = []
  let enabled: unknown[][] = []
  return {
    prototype: {
      _enable(...parameters) {
        enabled.push([this, ...parameters])
        return 'enabled'
      },
      disable() {
        disabled.push(this)
      },
    },
    disabled,
    enabled,
  }
}

describe('trackStores', () => {
  it('passes a call of the wrapped function on, with this and arguments', () => {
    let { prototype, enabled } = createPrototype()
    trackStores(prototype)
    let store = Object.create(prototype) as typeof prototype

    expect(store._enable('a', 'b')).toBe('enabled')
    expect(enabled).toStrictEqual([[store, 'a', 'b']])
  })

  it('disables every store remembered, once however often it was enabled', () => {
    let { prototype, disabled } = createPrototype()
    let stop = trackStores(prototype)
    let first = Object.create(prototype) as typeof prototype
    let second = Object.create(prototype) as typeof prototype
    first._enable()
    second._enable()
    first._enable()
    stop()

    expect(disabled).toStrictEqual([first, second])
  })

  it('forgets the stores it disabled', () => {
    let { prototype, disabled } = createPrototype()
    let stop = trackStores(prototype)
    let store = Object.create(prototype) as typeof prototype
    store._enable()
    stop()
    stop()

    expect(disabled).toStrictEqual([store])

    store._enable()
    stop()

    expect(disabled).toStrictEqual([store, store])
  })

  it('does nothing on a prototype with no such function', () => {
    let prototype = { disable: vi.fn() }
    let stop = trackStores(prototype)

    expect(Object.keys(prototype)).toStrictEqual(['disable'])
    expect(stop).not.toThrow()
    expect(prototype.disable).not.toHaveBeenCalled()
  })
})
