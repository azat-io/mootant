/**
 * Compares two strings by their UTF-16 code units, the order of the default
 * array sort, so the result never depends on the locale of the machine.
 *
 * @param left - String expected first.
 * @param right - String expected second.
 * @returns A negative number when `left` sorts first, a positive number when
 *   `right` sorts first and 0 when both strings are equal.
 */
export function compareCodeUnits(left: string, right: string): number {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}
