import { describe, expect, it, vi } from 'vitest'

import type { EnvironmentProxyState } from '../../../adapters/shared/types/environment-proxy-state'

import { createEnvironmentProxy } from '../../../adapters/shared/create-environment-proxy'
import { ENVIRONMENT_SLOT } from '../../../adapters/shared/environment-slot'

/**
 * Creates a state that records into a list.
 *
 * @param names - Receives the names reported.
 * @returns The state, with nothing ignored and no listing under way.
 */
function createState(names: string[]): EnvironmentProxyState {
  return {
    record: name => {
      names.push(name)
    },
    ignored: new Set(),
    listing: false,
  }
}

/**
 * Lets the current synchronous run end, so a listing of the variables no longer
 * covers the names read after it.
 */
async function nextRun(): Promise<void> {
  await Promise.resolve()
}

describe('createEnvironmentProxy', () => {
  it('reports a name read, tested or asked for its descriptor', () => {
    let names: string[] = []
    let proxy = createEnvironmentProxy({ A: '1' }, createState(names))

    expect(Reflect.get(proxy, 'A')).toBe('1')
    expect(Reflect.has(proxy, 'A')).toBe(true)
    expect(Reflect.has(proxy, 'B')).toBe(false)
    expect(Reflect.getOwnPropertyDescriptor(proxy, 'C')).toBeUndefined()
    expect(names).toStrictEqual(['A', 'A', 'B', 'C'])
  })

  it('writes through to the target and reports nothing', () => {
    let names: string[] = []
    let target: Record<string, string> = {}
    let proxy = createEnvironmentProxy(target, createState(names))

    expect(Reflect.set(proxy, 'A', '1')).toBe(true)
    expect(target).toStrictEqual({ A: '1' })
    expect(names).toStrictEqual([])
  })

  it('reports no symbol and no ignored name', () => {
    let names: string[] = []
    let state = createState(names)
    state.ignored = new Set(['IGNORED'])
    let proxy = createEnvironmentProxy({ IGNORED: '1' }, state)

    expect(Reflect.get(proxy, Symbol.iterator)).toBeUndefined()
    expect(Reflect.get(proxy, 'IGNORED')).toBe('1')
    expect(names).toStrictEqual([])
  })

  it('answers that it has the slot, which the target does not', () => {
    let names: string[] = []
    let target = {}
    let proxy = createEnvironmentProxy(target, createState(names))

    expect(Reflect.has(proxy, ENVIRONMENT_SLOT)).toBe(true)
    expect(Reflect.has(proxy, Symbol.iterator)).toBe(false)
    expect(Reflect.has(target, ENVIRONMENT_SLOT)).toBe(false)
    expect(names).toStrictEqual([])
  })

  it('reports each listing, and no names in the same run', async () => {
    let names: string[] = []
    let state = createState(names)
    let proxy = createEnvironmentProxy({ B: '2', A: '1' }, state)

    expect(Object.keys(proxy)).toStrictEqual(['B', 'A'])
    expect({ ...proxy }).toStrictEqual({ B: '2', A: '1' })
    expect(Reflect.get(proxy, 'A')).toBe('1')
    expect(state.listing).toBe(true)
    expect(names).toStrictEqual(['*', '*'])

    await nextRun()

    expect(state.listing).toBe(false)
    expect(Reflect.get(proxy, 'A')).toBe('1')
    expect(names).toStrictEqual(['*', '*', 'A'])
  })

  it('reads the state at every trap, never a copy of it', () => {
    let first: string[] = []
    let second: string[] = []
    let state = createState(first)
    let proxy = createEnvironmentProxy({}, state)
    Reflect.get(proxy, 'A')

    state.record = name => {
      second.push(name)
    }
    state.ignored = new Set(['A'])
    Reflect.get(proxy, 'A')
    Reflect.get(proxy, 'B')
    Reflect.has(proxy, 'D')
    Reflect.getOwnPropertyDescriptor(proxy, 'E')

    state.listing = true
    Reflect.get(proxy, 'C')

    state.listing = false
    state.ignored = new Set()
    Reflect.get(proxy, 'A')
    Object.keys(proxy)

    expect(first).toStrictEqual(['A'])
    expect(second).toStrictEqual(['B', 'D', 'E', 'A', '*'])
  })

  it('ends a listing after fake timers replace queueMicrotask', async () => {
    let names: string[] = []
    let state = createState(names)
    let proxy = createEnvironmentProxy({ A: '1' }, state)
    vi.useFakeTimers({ toFake: ['queueMicrotask'] })
    Object.keys(proxy)
    let timers = vi.getTimerCount()
    await nextRun()
    vi.useRealTimers()

    expect(timers).toBe(0)
    expect(state.listing).toBe(false)
    expect(Reflect.get(proxy, 'A')).toBe('1')
    expect(names).toStrictEqual(['*', 'A'])
  })

  it('records nothing while there is no receiver', () => {
    let state = createState([])
    state.record = null
    let proxy = createEnvironmentProxy({ A: '1' }, state)

    expect(Reflect.get(proxy, 'A')).toBe('1')
    expect(Object.keys(proxy)).toStrictEqual(['A'])
  })
})
