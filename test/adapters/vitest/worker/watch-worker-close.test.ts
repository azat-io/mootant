import { describe, expect, it } from 'vitest'

import { watchWorkerClose } from '../../../../adapters/vitest/worker/watch-worker-close'

/**
 * Tracing helper of a Vitest worker.
 */
interface FakeTraces {
  /**
   * Runs a step of the worker.
   */
  $(name: string, ...rest: unknown[]): unknown

  /**
   * Names of the steps that ran.
   */
  steps: string[]
}

/**
 * Creates a tracing helper that runs each step's function, the last argument,
 * and records the step's name.
 *
 * @returns Tracing helper.
 */
function createTraces(): FakeTraces {
  return {
    $(name, ...rest) {
      this.steps.push(name)
      return (rest.at(-1) as () => unknown)()
    },
    steps: [],
  }
}

describe('watchWorkerClose', () => {
  it('calls every listener once when the teardown finished', async () => {
    let traces = createTraces()
    let calls: unknown[] = []
    let first = watchWorkerClose(traces)!
    let second = watchWorkerClose(traces)!
    first(failure => {
      calls.push(['first', failure])
    })
    second(failure => {
      calls.push(['second', failure])
    })

    expect(traces.$('vitest.runtime.setup', () => 'sync')).toBe('sync')
    expect(calls).toStrictEqual([])
    await expect(
      traces.$('vitest.runtime.teardown', {}, () =>
        Promise.resolve('cleanup error'),
      ),
    ).resolves.toBe('cleanup error')
    expect(calls).toStrictEqual([
      ['first', null],
      ['second', null],
    ])
    await traces.$('vitest.runtime.teardown', () => Promise.resolve())
    expect(calls).toHaveLength(2)
    expect(traces.steps).toStrictEqual([
      'vitest.runtime.setup',
      'vitest.runtime.teardown',
      'vitest.runtime.teardown',
    ])
  })

  it('passes the error of the teardown to the listeners and on', async () => {
    let traces = createTraces()
    let error = new Error('left open')
    let calls: unknown[] = []
    watchWorkerClose(traces)!(failure => {
      calls.push(failure)
    })

    await expect(
      traces.$('vitest.runtime.teardown', () => Promise.reject(error)),
    ).rejects.toBe(error)
    expect(calls).toStrictEqual([{ error }])
  })

  it('watches nothing without a tracing helper', () => {
    expect(watchWorkerClose(undefined)).toBeNull()
    expect(watchWorkerClose(null)).toBeNull()
    expect(watchWorkerClose({})).toBeNull()
  })
})
