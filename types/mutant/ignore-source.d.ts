/**
 * Ignore directive comment credited for excluding a mutant.
 */
export interface IgnoreSource {
  /**
   * Keyword of the directive. A region is credited to its start comment.
   */
  directive:
    'mootant-ignore-next-line' | 'mootant-ignore-start' | 'mootant-ignore-file'

  /**
   * 1-based UTF-16 column where the comment starts.
   */
  column: number

  /**
   * 1-based line where the comment starts.
   */
  line: number
}
