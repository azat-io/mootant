import type { WorkerCalls } from '../types/worker-calls'

/**
 * Options of the default resolver that hold the project's own code, which it
 * calls as it reads a package.
 */
const CALLBACKS = new Set(['packageFilter', 'pathFilter'])

/**
 * Makes the default resolver of Jest 29.7 count its calls in
 * `calls.defaultResolver` until they return, so a project's own resolver that
 * hands it a request does not take its probes and `package.json` reads for its
 * own: those are Jest's, and the dependencies of a unit hold the `package.json`
 * files of what it loaded. A `packageFilter` or `pathFilter` that resolver
 * hands it is its own code again, so the count is 0 while one runs. Jest's
 * resolver and the resolver it gives a project's own one read the export at
 * each call, so the replaced export reaches both.
 *
 * @param module - Exports of `jest-resolve/build/defaultResolver.js`.
 * @param module.default - The default resolver, which is synchronous.
 * @param calls - Calls running in the worker.
 */
export function countDefaultResolverCalls(
  module: { default(path: unknown, options: object): unknown },
  calls: WorkerCalls,
): void {
  let resolve = module.default
  module.default = (path, options) => {
    calls.defaultResolver += 1
    try {
      return resolve(
        path,
        Object.fromEntries(
          Object.entries(options).map(([key, value]) => [
            key,
            typeof value === 'function' && CALLBACKS.has(key) ?
              runAsOwn(value as (...parameters: unknown[]) => unknown, calls)
            : value,
          ]),
        ),
      )
    } finally {
      calls.defaultResolver -= 1
    }
  }
}

/**
 * Wraps a callback of a project's own resolver so that the default resolver's
 * count is 0 while it runs, as what it reads is the project's.
 *
 * @param callback - A `packageFilter` or `pathFilter` of the project.
 * @param calls - Calls running in the worker.
 * @returns The callback, which keeps the `this` it is called with.
 */
function runAsOwn(
  callback: (...parameters: unknown[]) => unknown,
  calls: WorkerCalls,
): (...parameters: unknown[]) => unknown {
  return function (this: unknown, ...parameters: unknown[]): unknown {
    let depth = calls.defaultResolver
    calls.defaultResolver = 0
    try {
      return Reflect.apply(callback, this, parameters)
    } finally {
      calls.defaultResolver = depth
    }
  }
}
