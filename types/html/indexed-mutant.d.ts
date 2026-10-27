import type { HtmlReportMutant } from '../report/html-report'

/**
 * Mutant of the HTML report with what the page reads from its source.
 */
export interface IndexedMutant extends HtmlReportMutant {
  /**
   * Source text the mutant replaces.
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
   * Position in the mutants of the report.
   */
  index: number

  /**
   * 1-based line of the first replaced character.
   */
  line: number
}
