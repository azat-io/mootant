import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WorkerChannel } from '../../../../adapters/jest/types/worker-channel'
import type { JestRecord } from '../../../../adapters/jest/types/jest-record'

import { CHANNEL_SLOT } from '../../../../adapters/jest/worker/channel-slot'

/**
 * Timers of the process as they were before the entry replaced them.
 */
let timers = {
  clearImmediate,
  clearInterval,
  clearTimeout,
  setImmediate,
  setInterval,
  setTimeout,
}

/**
 * `process.env` as it was before the entry replaced it.
 */
let environment = process.env

/**
 * Puts a channel of a unit with a mutant on `process`, as a worker does.
 *
 * @returns The channel and the tokens and records it got.
 */
function placeChannel(): {
  written: [number, JestRecord][]
  channel: WorkerChannel
} {
  let written: [number, JestRecord][] = []
  let channel: WorkerChannel = {
    unit: {
      file: '/a.test.js',
      console: 'none',
      out: '/a.jsonl',
      project: 'p',
      mutant: 'm',
      plan: null,
    },
    write(token, record) {
      written.push([token, record])
    },
    enterEnvironment() {},
    begin: () => 0,
    end() {},
    vm: null,
    token: 9,
  }
  Reflect.set(process, CHANNEL_SLOT, channel)
  return { written, channel }
}

describe('vm-setup', () => {
  afterEach(() => {
    process.env = environment
    Object.assign(globalThis, timers)
    Reflect.deleteProperty(globalThis, '__mootant')
    Reflect.deleteProperty(Math, Symbol.for('mootant'))
    Reflect.deleteProperty(process, CHANNEL_SLOT)
    vi.resetModules()
  })

  it('installs the side on this realm, through the channel on process', async () => {
    let { written, channel } = placeChannel()
    await import('../../../../adapters/jest/worker/vm-setup')
    let side = channel.vm!

    expect(side.realmError).toBe(Error)
    expect(
      Object.getOwnPropertyDescriptor(globalThis, '__mootant'),
    ).toStrictEqual({
      value: side.runtime,
      configurable: true,
      enumerable: false,
      writable: true,
    })
    expect(setTimeout).not.toBe(timers.setTimeout)
    expect(side.runtime.active).toBe('m')
    expect(Reflect.get(Math, Symbol.for('mootant'))).toBe(side.runtime)
    expect(side.runtime.hit('m')).toBe(true)
    expect(written).toStrictEqual([[9, { kind: 'reached', hits: 1 }]])

    Reflect.get(process.env, 'READ_IN_THE_VM')

    expect(side.listVariables()).toContain('READ_IN_THE_VM')
  })

  it('does not take the stub of the worker for a runtime, as jest-environment-node copies it into the vm', async () => {
    let stub = { hit: () => false }
    Reflect.set(globalThis, '__mootant', stub)
    let { written, channel } = placeChannel()
    await import('../../../../adapters/jest/worker/vm-setup')
    let side = channel.vm!

    expect(side.runtime).not.toBe(stub)
    expect(Reflect.get(globalThis, '__mootant')).toBe(side.runtime)
    expect(side.runtime.hit('m')).toBe(true)
    expect(side.runtime.hits).toBe(1)
    expect(written).toStrictEqual([[9, { kind: 'reached', hits: 1 }]])
  })
})
