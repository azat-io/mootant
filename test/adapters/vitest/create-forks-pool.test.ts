import type { ForksPoolWorker, PoolWorker } from 'vitest/node'
import type { Mock } from 'vitest'

import { describe, expect, it, vi } from 'vitest'

import { createForksPool } from '../../../adapters/vitest/create-forks-pool'

/**
 * Forks worker of a fake Vitest.
 */
interface FakeWorker {
  /**
   * Sends an event of the process to its listeners.
   */
  emit(event: string, ...values: unknown[]): void

  /**
   * Listeners of the process by event.
   */
  listeners: Map<string, Set<Listener>>

  /**
   * Options the worker was created with.
   */
  options: unknown

  /**
   * Messages sent to the process.
   */
  sent: unknown[]
}

/**
 * Listener of a process event.
 */
type Listener = (...values: unknown[]) => void

/**
 * Flag of a worker's answer in Vitest's pool.
 */
const RESPONSE_FLAG = '__vitest_worker_response__'

/**
 * Creates a started worker of the pool over a fake forks worker.
 *
 * @param getChild - Returns the process of the fake worker; it has none by
 *   default.
 * @returns Worker of the pool, the fake worker it wraps, the fake's stop, the
 *   pool's message listener and the start times the pool noted.
 */
async function setup(getChild: () => unknown = () => {}): Promise<{
  stop: Mock<() => Promise<void>>
  spawns: Map<number, number>
  onMessage: Mock<Listener>
  worker: PoolWorker
  inner: FakeWorker
}> {
  let stop = vi.fn(() => Promise.resolve())
  let inner: FakeWorker = {
    emit: (event, ...values) => {
      inner.listeners.get(event)?.forEach(listener => {
        listener(...values)
      })
    },
    listeners: new Map(),
    options: null,
    sent: [],
  }
  /**
   * Creates the fake forks worker.
   *
   * @param options - Pool options.
   * @returns Fake forks worker.
   */
  function Worker(options: unknown): Partial<ForksPoolWorker> {
    inner.options = options
    return {
      on: (event, callback) => {
        let listeners = inner.listeners.get(event) ?? new Set()
        inner.listeners.set(event, listeners.add(callback))
      },
      off: (event, callback) => {
        inner.listeners.get(event)?.delete(callback)
      },
      send: message => {
        inner.sent.push(message)
      },
      get fork() {
        return getChild()
      },
      start: () => Promise.resolve(),
      deserialize: data => data,
      name: 'forks',
      cacheFs: true,
      stop,
    } as Partial<ForksPoolWorker>
  }
  let spawns = new Map<number, number>()
  let pool = createForksPool(Worker as never, spawns)
  let worker = pool.createPoolWorker({ distPath: '/dist' } as never)
  await worker.start()
  let onMessage = vi.fn<Listener>()
  worker.on('message', onMessage)
  return { onMessage, spawns, worker, inner, stop }
}

describe('createForksPool', () => {
  it('passes everything through to the forks worker', async () => {
    let { onMessage, worker, inner, stop } = await setup()
    worker.send({ type: 'stop' } as never)
    inner.emit('message', { type: 'stopped' })
    await worker.stop()
    inner.emit('exit', 0, null)

    expect(createForksPool(vi.fn() as never, new Map()).name).toBe(
      'mootant-forks',
    )
    expect(inner.options).toStrictEqual({ distPath: '/dist' })
    expect(worker).toMatchObject({ cacheFs: true, name: 'forks' })
    expect(worker.deserialize('data')).toBe('data')
    expect(inner.sent).toStrictEqual([{ type: 'stop' }])
    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ type: 'stopped' })
    expect(stop).toHaveBeenCalledExactlyOnceWith()
  })

  it('answers a pending stop when the process exits', async () => {
    let { onMessage, worker, inner, stop } = await setup()
    let other = vi.fn<Listener>()
    worker.on('message', other)
    worker.off('message', other)
    worker.send({ type: 'stop' } as never)
    inner.emit('exit', null, 'SIGKILL')
    await worker.stop()

    expect(onMessage).toHaveBeenCalledExactlyOnceWith({
      [RESPONSE_FLAG]: true,
      type: 'stopped',
    })
    expect(other).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
  })

  it('leaves an exit without a stop to Vitest', async () => {
    let { onMessage, worker, inner } = await setup()
    let onExit = vi.fn<Listener>()
    worker.on('exit', onExit)
    worker.send({ type: 'run' } as never)
    inner.emit('exit', 1, null)

    expect(onExit).toHaveBeenCalledExactlyOnceWith(1, null)
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('notes when it started the process of a worker', async () => {
    let before = performance.timeOrigin + performance.now()
    let { spawns } = await setup(() => ({ pid: 42 }))

    expect([...spawns.keys()]).toStrictEqual([42])
    expect(spawns.get(42)).toBeGreaterThanOrEqual(before)
    expect(spawns.get(42)).toBeLessThanOrEqual(
      performance.timeOrigin + performance.now(),
    )
  })

  it('notes nothing when the worker hides its process', async () => {
    let thrown = await setup(() => {
      throw new Error('The child process was torn down.')
    })
    let missing = await setup(() => ({}))

    expect(thrown.spawns.size).toBe(0)
    expect(missing.spawns.size).toBe(0)
  })
})
