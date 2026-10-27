import type { HtmlReportSkipped } from '../report/html-report'

/**
 * Skipped candidate of the HTML report with what the page reads from its
 * source.
 */
export interface IndexedSkip extends HtmlReportSkipped {
  /**
   * Source text the candidate replaces.
   */
  original: string

  /**
   * 1-based line of the last replaced character.
   */
  endLine: number

  /**
   * 1-based UTF-16 column of the first replaced character.
   */
  column: number

  /**
   * Position in the skipped candidates of its file.
   */
  index: number

  /**
   * 1-based line of the first replaced character.
   */
  line: number
}
