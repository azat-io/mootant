import type { SourcePosition } from '../../types/source/source-position'

/**
 * Converts an offset into a 1-based line and UTF-16 column with a binary search
 * over the line starts.
 *
 * @param lineStarts - Line start offsets from `getLineStarts`.
 * @param offset - Offset into the text the line starts belong to.
 * @returns Line and column of the offset. Offset 0 of a text that starts with a
 *   byte order mark is line 1, column 1.
 */
export function getSourcePosition(
  lineStarts: readonly number[],
  offset: number,
): SourcePosition {
  let low = 0
  let high = lineStarts.length - 1
  while (low < high) {
    let middle = Math.ceil((low + high) / 2)
    if (lineStarts[middle]! <= offset) {
      low = middle
    } else {
      high = middle - 1
    }
  }

  return {
    column: Math.max(offset - lineStarts[low]!, 0) + 1,
    line: low + 1,
  }
}
