/**
 * Range of a text that a mutant or skipped candidate replaces.
 */
interface PaintedRange {
  /**
   * Offset of the first replaced code unit.
   */
  start: number

  /**
   * Number the range is painted with.
   */
  value: number

  /**
   * Higher ranks cover lower ones.
   */
  rank: number

  /**
   * Offset just past the last replaced code unit.
   */
  end: number
}

/**
 * Decides which range each code unit of a text shows when ranges overlap: the
 * one of the highest rank, and of those the shortest. An empty range, an
 * insertion, paints the code unit at its start.
 *
 * @param length - Length of the text.
 * @param ranges - Ranges with the values to paint.
 * @returns Value of the shown range of each code unit, or -1 outside every
 *   range.
 */
export function paintRanges(
  length: number,
  ranges: readonly PaintedRange[],
): Int32Array {
  let painted = new Int32Array(length)
  painted.fill(-1)
  let ordered = ranges.toSorted(
    (first, second) =>
      first.rank - second.rank ||
      second.end - second.start - (first.end - first.start),
  )
  for (let range of ordered) {
    painted.fill(range.value, range.start, Math.max(range.end, range.start + 1))
  }
  return painted
}
