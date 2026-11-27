import { describe, expect, it, vi } from 'vitest'

import { watchProperty } from '../../../../adapters/vitest/worker/watch-property'

describe('watchProperty', () => {
  it('is a getter and a setter until the first read, which it reports, then the plain property again', () => {
    let owner: Record<string, unknown> = { x: 1 }
    let report = vi.fn<() => void>()

    expect(watchProperty(owner, 'x', report)).toBe(true)
    expect(Object.getOwnPropertyDescriptor(owner, 'x')).toHaveProperty('get')
    expect(owner['x']).toBe(1)
    expect(owner['x']).toBe(1)
    expect(report).toHaveBeenCalledExactlyOnceWith()
    expect(Object.getOwnPropertyDescriptor(owner, 'x')).toStrictEqual({
      configurable: true,
      enumerable: true,
      writable: true,
      value: 1,
    })
  })

  it('puts the plain property back with what code writes before it reads one, and reports nothing', () => {
    let owner: Record<string, unknown> = { x: 1 }
    let report = vi.fn<() => void>()
    watchProperty(owner, 'x', report)
    owner['x'] = 2

    expect(Object.getOwnPropertyDescriptor(owner, 'x')).toStrictEqual({
      configurable: true,
      enumerable: true,
      writable: true,
      value: 2,
    })
    expect(report).not.toHaveBeenCalled()
  })

  it('writes through an object or a function that inherits the property to that one, as a plain property would', () => {
    let owner: Record<string, unknown> = { x: 1 }
    watchProperty(owner, 'x', () => {})
    let object = Object.create(owner) as Record<string, unknown>
    let inheritor = Object.setPrototypeOf(() => {}, owner) as Record<
      string,
      unknown
    >
    object['x'] = 'object'
    inheritor['x'] = 'function'
    Reflect.set(owner, 'x', 'primitive', 1)

    expect(Object.getOwnPropertyDescriptor(object, 'x')).toStrictEqual({
      configurable: true,
      enumerable: true,
      value: 'object',
      writable: true,
    })
    expect(Object.hasOwn(inheritor, 'x')).toBe(true)
    expect(owner['x']).toBe(1)
  })

  it('keeps whether the property is enumerable', () => {
    let owner = Object.defineProperty({}, 'x', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: 1,
    }) as Record<string, unknown>
    watchProperty(owner, 'x', () => {})

    expect(Object.keys(owner)).toStrictEqual([])
    expect(owner['x']).toBe(1)
    expect(Object.getOwnPropertyDescriptor(owner, 'x')).toStrictEqual({
      configurable: true,
      enumerable: false,
      writable: true,
      value: 1,
    })
  })

  it('leaves a property that is missing, read-only, fixed or a getter', () => {
    let owner = Object.defineProperties(
      {},
      {
        frozen: { configurable: true, writable: false, value: 1 },
        fixed: { configurable: false, writable: true, value: 1 },
        getter: { configurable: true, get: () => 1 },
      },
    )

    expect(watchProperty(owner, 'missing', () => {})).toBe(false)
    expect(watchProperty(owner, 'frozen', () => {})).toBe(false)
    expect(watchProperty(owner, 'fixed', () => {})).toBe(false)
    expect(watchProperty(owner, 'getter', () => {})).toBe(false)
    expect(Object.getOwnPropertyDescriptor(owner, 'frozen')).toStrictEqual({
      configurable: true,
      enumerable: false,
      writable: false,
      value: 1,
    })
  })

  it('keeps the getter and the setter, with the value, when the owner no longer lets the plain property back', () => {
    let owner: Record<string, unknown> = { x: 1 }
    let report = vi.fn<() => void>()
    watchProperty(owner, 'x', report)
    Object.freeze(owner)

    expect(owner['x']).toBe(1)
    expect(report).toHaveBeenCalledExactlyOnceWith()
    expect(Object.getOwnPropertyDescriptor(owner, 'x')).toHaveProperty('get')
  })
})
