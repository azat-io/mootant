import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it } from 'vitest'

import type { WorkerCalls } from '../../../../adapters/jest/types/worker-calls'

import { countResolverCalls } from '../../../../adapters/jest/worker/count-resolver-calls'

/**
 * A resolver whose methods tell how many calls of the resolver run.
 */
class FakeResolver {
  /**
   * A property that is no method.
   */
  public readonly options = { extensions: ['.js'] }

  /**
   * Calls running in the worker.
   */
  public readonly calls: WorkerCalls

  /**
   * Keeps the calls the methods read.
   *
   * @param calls - Calls running in the worker.
   */
  public constructor(calls: WorkerCalls) {
    this.calls = calls
  }

  /**
   * Tells how many calls of the resolver run, later, and whether that is in the
   * store of an asynchronous call of the resolver.
   *
   * @returns A promise of the count and the store when it settles.
   */
  public async resolveModuleAsync(): Promise<[number, undefined | true]> {
    await Promise.resolve()
    return [this.calls.resolver, this.calls.asyncResolver.getStore()]
  }

  /**
   * Tells how many calls of the resolver run, once through another method.
   *
   * @param from - Directory of the module that asks.
   * @returns The count at the start of this call and of the inner one.
   */
  public resolveModule(from: string): [number, number, string] {
    return [this.calls.resolver, this.isCoreModule(), from]
  }

  /**
   * Throws with how many calls of the resolver run.
   *
   * @throws {Error} Always.
   */
  public fail(): never {
    throw new Error(`no module, ${this.calls.resolver} running`)
  }

  /**
   * Tells how many calls of the resolver run.
   *
   * @returns The count.
   */
  public isCoreModule(): number {
    return this.calls.resolver
  }
}

/**
 * Creates the calls of a worker with none running.
 *
 * @returns Calls at zero, with a store of their own.
 */
function createCalls(): WorkerCalls {
  return {
    asyncTransformer: new AsyncLocalStorage(),
    asyncResolver: new AsyncLocalStorage(),
    environment: new AsyncLocalStorage(),
    defaultResolver: 0,
    transformer: 0,
    unsettled: 0,
    resolver: 0,
  }
}

describe('countResolverCalls', () => {
  it('counts a call of a method until it returns, once with the calls it makes, and gives what it returns', () => {
    let calls = createCalls()
    let resolver = countResolverCalls(
      new FakeResolver(calls),
      calls,
    ) as FakeResolver

    expect(resolver.resolveModule('/p')).toStrictEqual([1, 1, '/p'])
    expect(resolver.isCoreModule()).toBe(1)
    expect(calls).toMatchObject({ transformer: 0, resolver: 0 })
    expect(calls.asyncResolver.getStore()).toBeUndefined()
  })

  it('stops counting a call that throws', () => {
    let calls = createCalls()
    let resolver = countResolverCalls(
      new FakeResolver(calls),
      calls,
    ) as FakeResolver

    expect(() => resolver.fail()).toThrow('no module, 1 running')
    expect(calls.resolver).toBe(0)
  })

  it('counts an asynchronous method only until it returns its promise, and keeps it in the store of the resolver after an await', async () => {
    let calls = createCalls()
    let resolver = countResolverCalls(
      new FakeResolver(calls),
      calls,
    ) as FakeResolver

    await expect(resolver.resolveModuleAsync()).resolves.toStrictEqual([
      0,
      true,
    ])
    expect(calls.asyncResolver.getStore()).toBeUndefined()
  })

  it('gives a property that is no method as it is', () => {
    let calls = createCalls()
    let real = new FakeResolver(calls)
    let resolver = countResolverCalls(real, calls) as FakeResolver

    expect(resolver.options).toBe(real.options)
    expect(resolver.calls).toBe(calls)
  })

  it('works unbound, on the resolver', () => {
    let calls = createCalls()
    let { resolveModule } = countResolverCalls(
      new FakeResolver(calls),
      calls,
    ) as FakeResolver

    expect(resolveModule('/q')).toStrictEqual([1, 1, '/q'])
  })
})
