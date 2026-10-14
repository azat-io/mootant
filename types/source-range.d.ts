/**
 * Range of UTF-16 offsets in a file.
 */
export interface SourceRange {
  /**
   * Offset of the first code unit.
   */
  start: number

  /**
   * Offset just past the last code unit.
   */
  end: number
}
