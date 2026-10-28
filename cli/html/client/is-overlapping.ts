import type { SourceRange } from '../../../types/source/source-range'

/**
 * Tells whether two ranges of a file share a code unit. An empty range, an
 * insertion, takes the code unit at its start, as `paintRanges` paints it.
 *
 * @param first - Range to check.
 * @param second - Other range.
 * @returns Whether a code unit is in both ranges.
 */
export function isOverlapping(
  first: SourceRange,
  second: SourceRange,
): boolean {
  return (
    first.start < Math.max(second.end, second.start + 1) &&
    second.start < Math.max(first.end, first.start + 1)
  )
}
