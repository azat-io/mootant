import { afterEach, describe, expect, it } from 'vitest'

import { installMutantRuntime } from '../../../core/runtime/install-mutant-runtime'
import { isHitLimitError } from '../../../core/runtime/is-hit-limit-error'

describe('installMutantRuntime', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, '__mootant')
  })

  it('installs a runtime with the original code active', () => {
    let runtime = installMutantRuntime()

    expect(Reflect.get(globalThis, '__mootant')).toBe(runtime)
    expect(runtime).toMatchObject({
      hitLimit: Infinity,
      coverage: null,
      reached: false,
      active: null,
      hits: 0,
    })
    expect(runtime.hit('a')).toBe(false)
    expect(runtime.hits).toBe(1)
  })

  it('returns the runtime already installed', () => {
    let runtime = installMutantRuntime()

    expect(installMutantRuntime()).toBe(runtime)
  })

  it('tells the active site and records that it was reached', () => {
    let runtime = installMutantRuntime()
    runtime.active = 'b'

    expect(runtime.hit('a')).toBe(false)
    expect(runtime.reached).toBe(false)
    expect(runtime.hit('b')).toBe(true)
    expect(runtime.reached).toBe(true)
    expect(runtime.hits).toBe(2)
  })

  it('collects the ids of evaluated sites while coverage is a set', () => {
    let runtime = installMutantRuntime()
    runtime.hit('a')
    let coverage = new Set<string>()
    runtime.coverage = coverage
    runtime.hit('b')
    runtime.hit('c')
    runtime.hit('b')

    expect([...coverage]).toStrictEqual(['b', 'c'])
  })

  it('throws past the hit limit until the hits are reset', () => {
    let runtime = installMutantRuntime()
    runtime.hitLimit = 2
    let coverage = new Set<string>()
    runtime.coverage = coverage
    runtime.active = 'a'
    runtime.hit('a')
    runtime.hit('a')

    let errors = [() => runtime.hit('b'), () => runtime.hit('a')].map(call => {
      try {
        call()
        return null
      } catch (error) {
        return error
      }
    })

    expect(errors.every(isHitLimitError)).toBe(true)
    expect(String(errors[0])).toContain('after 2 evaluations')
    expect([...coverage]).toStrictEqual(['a'])

    runtime.hits = 0

    expect(runtime.hit('a')).toBe(true)
  })

  it('works when the hit function is called detached', () => {
    let { hit } = installMutantRuntime()

    expect(hit('a')).toBe(false)
    expect(installMutantRuntime().hits).toBe(1)
  })
})
