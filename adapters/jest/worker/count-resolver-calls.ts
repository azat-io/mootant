import type { WorkerCalls } from '../types/worker-calls'

/**
 * Wraps Jest's resolver of a project so that `calls.resolver` counts each call
 * of one of its methods until the call returns. A method runs on the resolver
 * itself, so the calls it makes of other methods do not count again. An
 * asynchronous method counts until it returns its promise, so a read of a test
 * that runs while the promise is pending still counts as the test's, and runs
 * in `calls.asyncResolver` too, so what it goes on with after an `await`, such
 * as a project's own asynchronous resolver that reads a file, stays the
 * resolver's.
 *
 * @param resolver - Jest's resolver of a project.
 * @param calls - Calls running in the worker.
 * @returns The resolver behind a proxy.
 */
export function countResolverCalls(
  resolver: object,
  calls: WorkerCalls,
): object {
  return new Proxy(resolver, {
    /**
     * Gives a property of the resolver, a method as one that counts its calls.
     *
     * @param target - The resolver.
     * @param key - Name of the property.
     * @returns The property.
     */
    get(target, key) {
      let value: unknown = Reflect.get(target, key)
      if (typeof value !== 'function') {
        return value
      }
      /**
       * Calls the method on the resolver while `calls.resolver` counts it.
       *
       * @param parameters - Arguments of the call.
       * @returns What the method returns.
       */
      return (...parameters: unknown[]): unknown => {
        calls.resolver += 1
        try {
          return typeof key === 'string' && key.endsWith('Async') ?
              calls.asyncResolver.run(
                true,
                () => Reflect.apply(value, target, parameters) as unknown,
              )
            : (Reflect.apply(value, target, parameters) as unknown)
        } finally {
          calls.resolver -= 1
        }
      }
    },
  })
}
