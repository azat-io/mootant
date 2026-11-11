import type { EnvironmentProxyState } from './types/environment-proxy-state'

import { ENVIRONMENT_SLOT } from './environment-slot'

/**
 * Wraps an object of environment variables in a proxy that reports to the
 * receiver of the state the names read and `*` when they are listed. The fields
 * of the state are read at every trap, since their owner replaces them later.
 *
 * @param target - Object to wrap.
 * @param state - Tracking state; `listing` is written here too.
 * @returns The proxy; it answers that it has `ENVIRONMENT_SLOT`, so a caller
 *   can tell it from a plain object.
 */
export function createEnvironmentProxy(
  target: object,
  state: EnvironmentProxyState,
): object {
  // A test's fake timers replace the global after this.
  let schedule = queueMicrotask
  /**
   * Reports a variable read by its name.
   *
   * @param name - Property key read.
   */
  function report(name: string | symbol): void {
    if (
      typeof name === 'string' &&
      !state.listing &&
      !state.ignored.has(name)
    ) {
      state.record?.(name)
    }
  }
  return new Proxy(target, {
    ownKeys: object => {
      state.record?.('*')
      if (!state.listing) {
        state.listing = true
        schedule(() => {
          state.listing = false
        })
      }
      return Reflect.ownKeys(object)
    },
    getOwnPropertyDescriptor: (object, name) => {
      report(name)
      return Reflect.getOwnPropertyDescriptor(object, name)
    },
    has: (object, name) => {
      report(name)
      return name === ENVIRONMENT_SLOT || Reflect.has(object, name)
    },
    get: (object, name) => {
      report(name)
      return Reflect.get(object, name) as unknown
    },
    set: (object, name, value) => Reflect.set(object, name, value),
  })
}
