import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it } from 'vitest'

import type { WorkerCalls } from '../../../../adapters/jest/types/worker-calls'

import { countDefaultResolverCalls } from '../../../../adapters/jest/worker/count-default-resolver-calls'

/**
 * The default resolver's module as these tests make it.
 */
interface ResolverModule {
  /**
   * Resolves a path.
   */
  default(path: unknown, options: object): unknown
}

/**
 * Creates the count of the calls of a worker.
 *
 * @returns Calls with none running.
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

describe('countDefaultResolverCalls', () => {
  it('counts a call of the export while it runs, with its arguments and result as they are', () => {
    let calls = createCalls()
    let module: ResolverModule = {
      default: (request, options) => [request, options, calls.defaultResolver],
    }
    countDefaultResolverCalls(module, calls)

    expect(module.default('./a', { basedir: '/p' })).toStrictEqual([
      './a',
      { basedir: '/p' },
      1,
    ])
    expect(calls.defaultResolver).toBe(0)
  })

  it('stops counting a call that throws', () => {
    let calls = createCalls()
    let module: ResolverModule = {
      default: () => {
        throw new Error('Cannot find module')
      },
    }
    countDefaultResolverCalls(module, calls)

    expect(() => module.default('missing', {})).toThrow('Cannot find module')
    expect(calls.defaultResolver).toBe(0)
  })

  it("does not count while a packageFilter or a pathFilter of the project's resolver runs, as its reads are the project's", () => {
    let calls = createCalls()
    let seen: unknown[] = []
    let module: ResolverModule = {
      default: (_request, options) => {
        let { packageFilter, pathFilter } = options as {
          packageFilter(package_: object): object
          pathFilter(): string
        }
        seen.push(calls.defaultResolver)
        return [
          packageFilter.call(options, { main: 'a.js' }),
          pathFilter(),
          calls.defaultResolver,
        ]
      },
    }
    countDefaultResolverCalls(module, calls)
    let options = {
      packageFilter(this: unknown, package_: object): object {
        seen.push(calls.defaultResolver, this === options)
        return { ...package_, main: 'b.js' }
      },
      pathFilter: (): string => {
        seen.push(calls.defaultResolver)
        return 'c.js'
      },
      basedir: '/p',
    }

    expect(module.default('fallback', options)).toStrictEqual([
      { main: 'b.js' },
      'c.js',
      1,
    ])
    expect(seen).toStrictEqual([1, 0, false, 0])
    expect(calls.defaultResolver).toBe(0)
  })
})
