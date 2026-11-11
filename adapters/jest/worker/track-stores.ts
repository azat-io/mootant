/**
 * An `AsyncLocalStorage`, as far as this file uses it.
 */
interface Store {
  /**
   * Turns the store off until it is enabled again.
   */
  disable(): void
}

/**
 * Remembers every `AsyncLocalStorage` enabled from now on, through its private
 * `_enable`. On Jest 30 with Node 22 a store a unit left enabled made every
 * later unit slower, from 17 to 133 ms over 2000 units. Node 24 has no
 * `_enable`, and nothing to fix.
 *
 * @param prototype - `AsyncLocalStorage.prototype`.
 * @returns Function that disables every store remembered and forgets them.
 */
export function trackStores(prototype: object): () => void {
  let stores = new Set<Store>()
  let original = Reflect.get(prototype, '_enable') as
    ((...parameters: unknown[]) => unknown) | undefined

  /**
   * Remembers a store and enables it.
   *
   * @param parameters - Arguments of the call.
   * @returns What the original returns.
   */
  function enable(this: Store, ...parameters: unknown[]): unknown {
    stores.add(this)
    return original!.apply(this, parameters)
  }

  if (typeof original === 'function') {
    Reflect.set(prototype, '_enable', enable)
  }
  return () => {
    for (let store of stores) {
      store.disable()
    }
    stores.clear()
  }
}
