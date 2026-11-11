import { afterEach, describe, expect, it, vi } from 'vitest'
import { setTimeout as sleep } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'
import { promisify } from 'node:util'

import type { WorkerChannel } from '../../../../adapters/jest/types/worker-channel'
import type { JestRecord } from '../../../../adapters/jest/types/jest-record'
import type { JestUnit } from '../../../../adapters/jest/types/jest-unit'
import type { VmSide } from '../../../../adapters/jest/types/vm-side'

import { installMutantRuntime } from '../../../../core/runtime/install-mutant-runtime'
import { installVmSide } from '../../../../adapters/jest/worker/install-vm-side'
import { isHitLimitError } from '../../../../core/runtime/is-hit-limit-error'

/**
 * A vm's global object, with Node's timers.
 */
interface FakeTarget {
  /**
   * Object with the environment of the vm.
   */
  process: { env: object }

  /**
   * Timers and what clears them.
   */
  [timer: string]: unknown

  /**
   * `Error` of the vm.
   */
  Error: ErrorConstructor
}

/**
 * Creates a channel that collects what is written.
 *
 * @param unit - What differs from a dry unit.
 * @returns The channel and the tokens and records it got.
 */
function createChannel(unit: Partial<JestUnit> = {}): {
  written: [number, JestRecord][]
  channel: WorkerChannel
} {
  let written: [number, JestRecord][] = []
  let channel: WorkerChannel = {
    unit: {
      file: '/a.test.js',
      console: 'buffer',
      out: '/a.jsonl',
      project: 'p',
      mutant: null,
      plan: null,
      ...unit,
    },
    write(token, record) {
      written.push([token, record])
    },
    enterEnvironment() {},
    begin: () => 0,
    end() {},
    vm: null,
    token: 7,
  }
  return { written, channel }
}

/**
 * Sets up a vm with the real runtime.
 *
 * @param unit - What differs from a dry unit.
 * @param target - The vm's global object.
 * @returns What was installed.
 */
function install(
  unit: Partial<JestUnit> = {},
  target: FakeTarget = createTarget(),
): {
  written: [number, JestRecord][]
  channel: WorkerChannel
  target: FakeTarget
  side: VmSide
} {
  let { written, channel } = createChannel(unit)
  installVmSide({ install: installMutantRuntime, channel, target })
  return { side: channel.vm!, written, channel, target }
}

/**
 * Creates a global object with Node's timers and an `Error` of its own.
 *
 * @returns The global object.
 */
function createTarget(): FakeTarget {
  return {
    Error: runInNewContext('Error') as ErrorConstructor,
    process: { env: { A: '1', B: '2' } },
    clearImmediate,
    clearInterval,
    clearTimeout,
    setImmediate,
    setInterval,
    setTimeout,
  }
}

/**
 * Calls a timer function of a vm.
 *
 * @param target - The vm's global object.
 * @param name - Name of the function.
 * @param parameters - Arguments of the call.
 * @returns The handle.
 */
function callTimer(
  target: FakeTarget,
  name: string,
  ...parameters: unknown[]
): unknown {
  return (target[name] as (...values: unknown[]) => unknown)(...parameters)
}

describe('installVmSide', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, '__mootant')
    Reflect.deleteProperty(Math, Symbol.for('mootant'))
  })

  it('redefines the runtime on the target as not enumerable', () => {
    let { target, side } = install()

    expect(Object.getOwnPropertyDescriptor(target, '__mootant')).toStrictEqual({
      value: side.runtime,
      configurable: true,
      enumerable: false,
      writable: true,
    })
    expect(Object.keys(target)).not.toContain('__mootant')
  })

  it('marks the runtime so that Jest 30 leaves it', () => {
    let { side } = install()

    expect(
      Reflect.get(side.runtime, Symbol.for('$$jest-protect-from-deletion')),
    ).toBe(true)
  })

  it('registers the side last, so a setup that throws leaves none', () => {
    let { channel } = createChannel()
    let target = createTarget()
    Object.defineProperty(target, 'process', {
      get() {
        throw new Error('late')
      },
    })

    expect(() => {
      installVmSide({ install: installMutantRuntime, channel, target })
    }).toThrow('late')
    expect(channel.vm).toBeNull()
  })

  it('registers the Error and the runtime of the vm', () => {
    let { target, side } = install()

    expect(side.realmError).toBe(target.Error)
    expect(side.runtime).toBe(Reflect.get(target, '__mootant'))
  })

  describe('hit', () => {
    it('writes reached with the hits on the first true only', () => {
      let { written, side } = install({ mutant: 'm' })

      expect(side.runtime.hit('other')).toBe(false)
      expect(written).toStrictEqual([])
      expect(side.isReached()).toBe(false)

      expect(side.runtime.hit('m')).toBe(true)
      expect(side.runtime.hit('m')).toBe(true)
      expect(written).toStrictEqual([[7, { kind: 'reached', hits: 2 }]])
      expect(side.isReached()).toBe(true)
    })

    it('writes under the token the unit began with', () => {
      let { channel, written, side } = install({ mutant: 'm' })
      channel.token = 8
      side.runtime.hit('m')

      expect(written.map(([token]) => token)).toStrictEqual([7])
    })

    it('stays reached when the runtime resets its own flag', () => {
      let { side } = install({ mutant: 'm' })
      side.runtime.hit('m')
      side.runtime.reached = false

      expect(side.isReached()).toBe(true)
    })

    it('returns false, counts nothing and writes nothing after close', () => {
      let { written, side } = install({ mutant: 'm' })
      side.close()

      expect(side.runtime.hit('m')).toBe(false)
      expect(side.runtime.hits).toBe(0)
      expect(side.isReached()).toBe(false)
      expect(written).toStrictEqual([])
    })

    it('adds to the coverage until close', () => {
      let { side } = install()
      side.runtime.hit('a')
      side.close()
      side.runtime.hit('b')

      expect([...(side.runtime.coverage as Set<string>)]).toStrictEqual(['a'])
    })

    it('lets the error of the hit limit through', () => {
      let { side } = install({ mutant: 'm', hitLimit: 1 })
      side.runtime.hit('other')
      let error: unknown = null
      try {
        side.runtime.hit('other')
      } catch (error_) {
        error = error_
      }

      expect(isHitLimitError(error)).toBe(true)
    })
  })

  describe('timers', () => {
    it('clears live timers of all three kinds', async () => {
      let { target, side } = install()
      let callback = vi.fn()
      callTimer(target, 'setTimeout', callback, 1)
      callTimer(target, 'setInterval', callback, 1)
      callTimer(target, 'setImmediate', callback)
      side.stopTimers()
      await sleep(10)

      expect(callback).not.toHaveBeenCalled()
    })

    it('clears a handle once, and goes on with timers started later', () => {
      let cleared: unknown[] = []
      let target = createTarget()
      target['setTimeout'] = () => 'handle'
      target['clearTimeout'] = (handle: unknown) => {
        cleared.push(handle)
      }
      let { side } = install({}, target)
      callTimer(target, 'setTimeout')
      side.stopTimers()
      side.stopTimers()

      expect(cleared).toStrictEqual(['handle'])

      callTimer(target, 'setTimeout')
      side.stopTimers()

      expect(cleared).toStrictEqual(['handle', 'handle'])
    })

    it('leaves out what the target does not have, as jsdom has no setImmediate', async () => {
      let target = createTarget()
      Reflect.deleteProperty(target, 'setImmediate')
      Reflect.deleteProperty(target, 'clearImmediate')
      let { side } = install({}, target)
      let callback = vi.fn()
      callTimer(target, 'setTimeout', callback, 1)
      callTimer(target, 'setInterval', callback, 1)
      side.stopTimers()
      await sleep(10)

      expect(target['setImmediate']).toBeUndefined()
      expect(callback).not.toHaveBeenCalled()
    })

    it('leaves a timer with nothing to clear it as it is, so stopping cannot throw', () => {
      let target = createTarget()
      Reflect.deleteProperty(target, 'clearImmediate')
      let { side } = install({}, target)
      callTimer(target, 'setImmediate', () => {})

      expect(target['setImmediate']).toBe(setImmediate)
      expect(() => {
        side.stopTimers()
      }).not.toThrow()
    })

    it('calls the original with its this and arguments and returns its handle', () => {
      let calls: unknown[][] = []
      let target = createTarget()
      target['setTimeout'] = function (
        this: unknown,
        ...parameters: unknown[]
      ) {
        calls.push([this, ...parameters])
        return 'handle'
      }
      install({}, target)
      let holder = {
        start: target['setTimeout'] as (...values: unknown[]) => unknown,
      }

      expect(holder.start('callback', 5, 'argument')).toBe('handle')
      expect(calls).toStrictEqual([[holder, 'callback', 5, 'argument']])
    })

    it('clears with the matching function it took at install, on the target', () => {
      let cleared: unknown[][] = []
      let target = createTarget()
      target['setInterval'] = () => 'handle'
      target['clearInterval'] = function (
        this: unknown,
        ...parameters: unknown[]
      ) {
        cleared.push([this, ...parameters])
      }
      let { side } = install({}, target)
      callTimer(target, 'setInterval')
      target['clearInterval'] = () => {
        throw new Error('a test replaced this')
      }
      side.stopTimers()

      expect(cleared).toStrictEqual([[target, 'handle']])
    })

    it('keeps the util.promisify.custom of the original', async () => {
      let target = createTarget()
      let custom = Reflect.get(setTimeout, promisify.custom) as unknown
      install({}, target)
      let wrapped = target['setTimeout'] as typeof setTimeout

      expect(wrapped).not.toBe(setTimeout)
      expect(Reflect.get(wrapped, promisify.custom)).toBe(custom)

      // eslint-disable-next-line typescript/strict-void-return -- promisify takes the promise form the function carries.
      await expect(promisify(wrapped)(1, 'value')).resolves.toBe('value')
    })

    it('keeps the own properties of the original but length, name and prototype', () => {
      let target = createTarget()
      let key = Symbol('key')

      /**
       * Timer function with properties of its own.
       *
       * @param _first - Unused.
       * @param _second - Unused.
       */
      function start(_first: unknown, _second: unknown): void {}

      Object.assign(start, { [key]: 'symbol', named: 'string' })
      target['setTimeout'] = start
      install({}, target)
      let wrapped = target['setTimeout'] as (...values: unknown[]) => unknown

      expect(Reflect.get(wrapped, key)).toBe('symbol')
      expect(Reflect.get(wrapped, 'named')).toBe('string')
      expect(wrapped).toHaveLength(0)
      expect(wrapped.name).not.toBe('start')
      expect(wrapped.prototype).not.toBe(start.prototype)
    })
  })

  describe('environment', () => {
    it('reports reads, and * for a listing', async () => {
      let { target, side } = install()
      let { env } = target.process

      expect(Reflect.get(env, 'A')).toBe('1')
      expect('B' in env).toBe(true)
      expect('MISSING' in env).toBe(false)
      expect(side.listVariables()).toStrictEqual(['A', 'B', 'MISSING'])

      await Promise.resolve()

      expect(Object.keys(env).toSorted()).toStrictEqual(['A', 'B'])
      expect(side.listVariables()).toStrictEqual(['A', 'B', 'MISSING', '*'])
    })

    it('ignores no name', () => {
      let { target, side } = install()
      Reflect.get(target.process.env, 'WATCH_REPORT_DEPENDENCIES')

      expect(side.listVariables()).toStrictEqual(['WATCH_REPORT_DEPENDENCIES'])
    })

    it('adds a variable the code made a child process read, each once', () => {
      let { target, side } = install()
      Reflect.get(target.process.env, 'A')
      side.addVariable('*')
      side.addVariable('*')

      expect(side.listVariables()).toStrictEqual(['A', '*'])
    })

    it('passes writes through and reports nothing for them', () => {
      let env: Record<string, string> = {}
      let target = createTarget()
      target.process.env = env
      let { side } = install({}, target)
      Reflect.set(target.process.env, 'C', '3')

      expect(env).toStrictEqual({ C: '3' })
      expect(side.listVariables()).toStrictEqual([])
    })
  })

  describe('a unit', () => {
    it('collects coverage with no mutant and no limit in a dry unit', () => {
      let { side } = install()

      expect(side.runtime.active).toBeNull()
      expect(side.runtime.hitLimit).toBe(Infinity)
      expect(side.runtime.coverage).toBeInstanceOf(Set)
    })

    it('activates the mutant, sets the limit and collects no coverage with a mutant', () => {
      let { side } = install({ hitLimit: 10, mutant: 'm' })

      expect(side.runtime.active).toBe('m')
      expect(side.runtime.hitLimit).toBe(10)
      expect(side.runtime.coverage).toBeNull()
    })

    it('has no limit for a mutant without one', () => {
      let { side } = install({ mutant: 'm' })

      expect(side.runtime.hitLimit).toBe(Infinity)
    })
  })
})
