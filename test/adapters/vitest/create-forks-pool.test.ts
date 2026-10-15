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
 * @returns Worker of the pool, the fake worker it wraps, the fake's stop and
 *   the pool's message listener.
 */
async function setup(): Promise<{
  stop: Mock<() => Promise<void>>
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
      start: () => Promise.resolve(),
      deserialize: data => data,
      name: 'forks',
      cacheFs: true,
      stop,
    }
  }
  let pool = createForksPool(Worker as never)
  let worker = pool.createPoolWorker({ distPath: '/dist' } as never)
  await worker.start()
  let onMessage = vi.fn<Listener>()
  worker.on('message', onMessage)
  return { onMessage, worker, inner, stop }
}

describe('createForksPool', () => {
  it('passes everything through to the forks worker', async () => {
    let { onMessage, worker, inner, stop } = await setup()
    worker.send({ type: 'stop' } as never)
    inner.emit('message', { type: 'stopped' })
    await worker.stop()
    inner.emit('exit', 0, null)

    expect(createForksPool(vi.fn() as never).name).toBe('mootant-forks')
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
})
