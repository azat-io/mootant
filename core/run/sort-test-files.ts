import { compareCodeUnits } from '../compare-code-units'

/**
 * Sorts test files the likeliest first: by rank (`rankTestFile`), then by how
 * many of their tests reach the code, most first, then by key.
 *
 * @param keys - Keys of the test files (`getTestFileKey`), each with a rank.
 * @param order - Ranks and reaching tests.
 * @param order.ranks - Rank of each test file by key.
 * @param order.reaching - Number of tests of each test file that reach the
 *   code, by key, a missing file having none.
 * @returns New sorted array.
 */
export function sortTestFiles(
  keys: Iterable<string>,
  order: {
    reaching: ReadonlyMap<string, number>
    ranks: ReadonlyMap<string, number>
  },
): string[] {
  let { reaching, ranks } = order
  return [...keys].toSorted(
    (left, right) =>
      ranks.get(left)! - ranks.get(right)! ||
      (reaching.get(right) ?? 0) - (reaching.get(left) ?? 0) ||
      compareCodeUnits(left, right),
  )
}
