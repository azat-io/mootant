import type { SkipCategory } from '../mutant/skip-category'

/**
 * Counts of a list run.
 */
export interface ListReportSummary {
  /**
   * Number of skipped candidates in each category, every category included.
   * Present only with `--skipped`.
   */
  skippedByCategory?: Record<SkipCategory, number>

  /**
   * Number of skipped candidates. Present only with `--skipped`.
   */
  totalSkipped?: number

  /**
   * Number of diagnostics with the severity `warning`.
   */
  totalWarnings: number

  /**
   * Number of mutants, pending and ignored.
   */
  totalMutants: number

  /**
   * Number of mutants that will be tested.
   */
  totalPending: number

  /**
   * Number of mutants excluded by ignore directives.
   */
  totalIgnored: number

  /**
   * Number of diagnostics with the severity `error`.
   */
  totalErrors: number

  /**
   * Number of listed files, parsed or not.
   */
  totalFiles: number
}
