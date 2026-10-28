/**
 * Finds the last of some items sorted by start that starts at or before an
 * offset, with a binary search.
 *
 * @param items - Items in ascending order of their starts.
 * @param offset - Offset to look up.
 * @param getStart - Reads the start of an item.
 * @returns Index of the last item that starts at or before the offset, or 0
 *   when none does or there are no items.
 */
export function findLastStart<Item>(
  items: readonly Item[],
  offset: number,
  getStart: (item: Item) => number,
): number {
  let low = 0
  let high = items.length - 1
  while (low < high) {
    let middle = Math.ceil((low + high) / 2)
    if (getStart(items[middle]!) <= offset) {
      low = middle
    } else {
      high = middle - 1
    }
  }
  return low
}
