import { describeObject } from './describe-object.ts'

/**
 * Writes a value as canonical text, so two results compare as strings: `-0`
 * differs from `0` and `NaN` is written as such, strings are quoted, object
 * keys are sorted and arrays keep their order. Dates, maps, sets, errors and
 * class instances are written with their kind. Properties and array elements
 * are read through their descriptors: an accessor is written as `get`/`set`
 * without being called, so describing a value never runs its getters, and a
 * hole is written as such. Reference identity is part of the text: an object
 * met again is written as `*` and the path where it was first met, so a copy
 * differs from the object itself and a cycle ends; an object that existed
 * before a run is written with `@` and its path at that time, so replacing it
 * with an equal new object is seen too.
 *
 * @param value - Value to describe.
 * @param before - Objects that existed before the run, with their paths then.
 * @returns Canonical text of the value.
 */
export function describeValue(
  value: unknown,
  before: ReadonlyMap<object, string> = new Map(),
): string {
  let paths = new Map<object, string>()

  /**
   * Describes one value met at a path.
   *
   * @param item - Value to describe.
   * @param path - Path from the described value to the item.
   * @returns Canonical text of the item.
   */
  function describe(item: unknown, path: string): string {
    if (typeof item === 'function') {
      return 'function'
    }
    if (typeof item !== 'object' || item === null) {
      return describePrimitive(item)
    }
    let seen = paths.get(item)
    if (seen !== undefined) {
      return `*${seen}`
    }
    paths.set(item, path)
    let origin = before.get(item)
    let mark = origin === undefined ? '' : `@${origin}`
    return `${mark}${describeObject(item, path, describe)}`
  }

  return describe(value, '')
}

/**
 * Writes a primitive value as canonical text: a string quoted, `-0` apart from
 * `0`, any other value with its type.
 *
 * @param value - String, number, BigInt, boolean, symbol, null or undefined.
 * @returns Canonical text of the value.
 */
function describePrimitive(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Object.is(value, -0)) {
    return '-0'
  }
  return `${typeof value}:${String(value)}`
}
