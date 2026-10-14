import type { CallbackOwner } from './get-callback-owner'

/**
 * Tells whether a result makes a comparator a no-op (catalog 2.2, O12): a
 * result that compares as `0` (`Number(value)` is `0` or `NaN`, as for `0`,
 * `false`, `''`, `[]`, `null` and `undefined`) makes a stable `sort` keep the
 * order, so it returns its receiver as if the call were removed. `toSorted`
 * returns a copy, which removing the call does not, so no result of its
 * comparator is the same as the removal; neither is a constant `filter`
 * predicate, whose call also returns a new array.
 *
 * @param owner - Method that calls the comparator.
 * @param value - Result the comparator would return for every call.
 * @returns Whether the call then behaves as if it were removed.
 */
export function emptiesCallback(owner: CallbackOwner, value: unknown): boolean {
  if (owner !== 'sort') {
    return false
  }
  let number = Number(value)
  return number === 0 || Number.isNaN(number)
}
