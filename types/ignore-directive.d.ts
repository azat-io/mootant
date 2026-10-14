/**
 * Directive comment such as `// mootant-ignore-next-line string-literal: log`.
 */
export interface IgnoreDirective {
  /**
   * Directive keyword without the `mootant-ignore-` prefix.
   */
  kind: 'next-line' | 'start' | 'file' | 'end'

  /**
   * Known mutator ids the directive lists, without duplicates, or null when it
   * lists none and applies to every mutator. An empty list applies to none.
   */
  mutators: readonly string[] | null

  /**
   * Text after the colon with whitespace collapsed, or null when it is missing
   * or blank.
   */
  reason: string | null

  /**
   * 1-based line of the last character of the comment.
   */
  endLine: number

  /**
   * 1-based UTF-16 column where the comment starts.
   */
  column: number

  /**
   * Offset where the comment starts.
   */
  start: number

  /**
   * 1-based line where the comment starts.
   */
  line: number

  /**
   * Offset just past the comment.
   */
  end: number
}
