import type { ListReportMutator } from '../report/list-report-mutator'
import type { StatusCounts } from '../run/status-counts'

/**
 * Mutator of the HTML report with the verdicts of its mutants.
 */
export interface IndexedMutator extends ListReportMutator {
  /**
   * Its mutants by status.
   */
  counts: StatusCounts

  /**
   * Total score of its mutants, or null without mutants to score.
   */
  score: number | null

  /**
   * Candidates it considered and skipped.
   */
  skipped: number
}
