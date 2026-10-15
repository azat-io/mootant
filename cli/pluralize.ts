/**
 * Joins a count and a noun, adding `s` unless the count is one.
 *
 * @param count - Number of things.
 * @param noun - Singular noun.
 * @returns Text such as `1 file` or `2 files`.
 */
export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
