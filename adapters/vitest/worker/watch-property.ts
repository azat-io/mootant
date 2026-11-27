/**
 * Turns a plain property, a writable and configurable one, into a getter and a
 * setter until code first reads or writes it, as one unit runs in a worker: a
 * read is reported and a write is not, and either puts the plain property back,
 * with the value read or written, so the code meets it as a plain property from
 * then on. A write through an object or a function that inherits the property
 * gives that one its own property, as with the plain property, such as an
 * object made with `Object.create(globalThis)`. The getter and the setter stay
 * when the owner no longer lets the plain property back, as after
 * `Object.freeze`.
 *
 * @param owner - Object that holds the property.
 * @param key - Property of the owner to watch.
 * @param report - Reports the first read.
 * @returns Whether the property was such a plain one and is watched now.
 */
export function watchProperty(
  owner: object,
  key: string,
  report: () => void,
): boolean {
  let descriptor = Reflect.getOwnPropertyDescriptor(owner, key)
  if (descriptor?.writable !== true || descriptor.configurable !== true) {
    return false
  }
  let { enumerable } = descriptor
  let { value } = descriptor as { value: unknown }
  /**
   * Puts the plain property back.
   *
   * @param next - Value of the property.
   */
  function restore(next: unknown): void {
    value = next
    Reflect.defineProperty(owner, key, {
      configurable: true,
      writable: true,
      value: next,
      enumerable,
    })
  }
  return Reflect.defineProperty(owner, key, {
    set(this: unknown, next: unknown) {
      if (this === owner) {
        restore(next)
      } else if (
        (typeof this === 'object' && this !== null) ||
        typeof this === 'function'
      ) {
        Reflect.defineProperty(this, key, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: next,
        })
      }
    },
    get: () => {
      report()
      restore(value)
      return value
    },
    configurable: true,
    enumerable,
  })
}
