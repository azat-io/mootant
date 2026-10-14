import { describeObject } from './describe-object.ts'

/**
 * Lists the objects reachable from a value with their paths, reading properties
 * and elements through their descriptors, so a run can tell later which objects
 * existed before it.
 *
 * @param value - Value whose objects are listed.
 * @returns Objects reachable from the value, with the path where each was first
 *   met.
 */
export function listObjects(value: unknown): Map<object, string> {
  let paths = new Map<object, string>()

  /**
   * Lists one value met at a path.
   *
   * @param item - Value to list.
   * @param path - Path from the listed value to the item.
   * @returns Empty text; only the paths are kept.
   */
  function visit(item: unknown, path: string): string {
    if (typeof item === 'object' && item !== null && !paths.has(item)) {
      paths.set(item, path)
      describeObject(item, path, visit)
    }
    return ''
  }

  visit(value, '')
  return paths
}
