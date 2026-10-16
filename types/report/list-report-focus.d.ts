/**
 * Part of a mutant's range that the mutant changes, such as the edited part of
 * a regular expression pattern. Apply the mutant with `original` and
 * `replacement` of the mutant; the focus only says where to look.
 */
export interface ListReportFocus {
  /**
   * Text written in place of `original`.
   */
  replacement: string

  /**
   * Source text of the changed part; empty for an insertion.
   */
  original: string

  /**
   * 1-based UTF-16 column of the first changed character.
   */
  column: number

  /**
   * UTF-16 offset of the first changed code unit in the file as read.
   */
  start: number

  /**
   * 1-based line of the first changed character.
   */
  line: number

  /**
   * UTF-16 offset just past the last changed code unit.
   */
  end: number
}
