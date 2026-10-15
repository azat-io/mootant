import type { SourceRange } from './source-range'

/**
 * Replacement of a range of the file with new text. An empty range is an
 * insertion, an empty text a deletion.
 */
export interface TextEdit extends SourceRange {
  /**
   * Text written in place of the range.
   */
  text: string
}
