/**
 * Writes a value as canonical text, so two results compare as strings: `-0`
 * differs from `0`, strings are quoted, object keys are sorted and arrays keep
 * their order. A property test compares the outputs of a mutant with those of
 * the original program this way.
 *
 * @param value - Value to describe.
 * @returns Canonical text of the value.
 */
export function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => describeValue(item)).join(',')}]`
  }
  if (typeof value === 'object' && value !== null) {
    let entries = Object.entries(value).toSorted(([first], [second]) =>
      first < second ? -1 : 1,
    )
    return `{${entries.map(([key, item]) => `${key}:${describeValue(item)}`).join(',')}}`
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Object.is(value, -0)) {
    return '-0'
  }
  return `${typeof value}:${String(value)}`
}
