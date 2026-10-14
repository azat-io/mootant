/**
 * Writes an object as canonical text, describing its parts with a callback.
 *
 * @param item - Object to write.
 * @param path - Where the object sits, written from the described root.
 * @param describe - Writes a part of the object met at a path.
 * @returns Canonical text of the object.
 */
export function describeObject(
  item: object,
  path: string,
  describe: (part: unknown, partPath: string) => string,
): string {
  if (Array.isArray(item)) {
    let elements: string[] = []
    for (let index = 0; index < item.length; index++) {
      let descriptor = Object.getOwnPropertyDescriptor(item, index)
      elements.push(
        descriptor ?
          describeProperty(descriptor, `${path}[${index}]`, describe)
        : '<hole>',
      )
    }
    return `[${elements.join(',')}]`
  }
  if (item instanceof Date) {
    let time = item.getTime()
    return `Date(${Number.isNaN(time) ? 'invalid' : item.toISOString()})`
  }
  if (item instanceof Error) {
    return `${item.name}(${JSON.stringify(item.message)})`
  }
  if (item instanceof Map) {
    let entries = [...item].map(
      ([key, entry], index) =>
        `${describe(key, `${path}.key${index}`)}=>${describe(entry, `${path}.value${index}`)}`,
    )
    return `Map{${entries.join(',')}}`
  }
  if (item instanceof Set) {
    let entries = [...item].map((entry, index) =>
      describe(entry, `${path}.entry${index}`),
    )
    return `Set{${entries.join(',')}}`
  }
  let entries = Object.entries(Object.getOwnPropertyDescriptors(item))
    .toSorted(([first], [second]) => (first < second ? -1 : 1))
    .map(
      ([key, descriptor]) =>
        `${key}:${describeProperty(descriptor, `${path}.${key}`, describe)}`,
    )
  return `${getKind(item)}{${entries.join(',')}}`
}

/**
 * Writes a property through its descriptor: the value of a data property, or
 * `<get>`, `<set>` or `<get,set>` for an accessor, which is not called.
 *
 * @param descriptor - Data or accessor descriptor read from the owner.
 * @param path - Where the property sits, written from the described root.
 * @param describe - Writes a value met at a path.
 * @returns Canonical text of the property.
 */
function describeProperty(
  descriptor: PropertyDescriptor,
  path: string,
  describe: (part: unknown, partPath: string) => string,
): string {
  if ('value' in descriptor) {
    return describe(descriptor.value, path)
  }
  let accessors = [descriptor.get && 'get', descriptor.set && 'set']
  return `<${accessors.filter(Boolean).join(',')}>`
}

/**
 * Names the kind of a plain object or class instance: empty for an object whose
 * prototype is `Object.prototype` or null, the constructor name otherwise.
 *
 * @param value - Object to name.
 * @returns Kind written before the object's properties.
 */
function getKind(value: object): string {
  let prototype = Object.getPrototypeOf(value) as object | null
  if (prototype === null || prototype === Object.prototype) {
    return ''
  }
  let { constructor } = prototype as { constructor?: { name?: string } }
  return constructor?.name ?? '?'
}
