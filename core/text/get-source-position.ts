import type { SourcePosition } from '../../types/source/source-position'

import { findLastStart } from './find-last-start'

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
  let index = findLastStart(lineStarts, offset, start => start)
  return {
    column: Math.max(offset - lineStarts[index]!, 0) + 1,
    line: index + 1,
  }
}
