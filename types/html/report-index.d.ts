import type { HtmlReport } from '../report/html-report'
import type { IndexedMutator } from './indexed-mutator'
import type { IndexedMutant } from './indexed-mutant'
import type { StatusCounts } from './status-counts'
import type { IndexedFile } from './indexed-file'

/**
 * Data of the HTML report as the page reads it.
 */
export interface ReportIndex {
  /**
   * Mutants of the report by id.
   */
  byId: Map<string, IndexedMutant>

  /**
   * Mutants to act on, the files with the lowest score first, in file order.
   */
  actionable: IndexedMutant[]

  /**
   * Mutators with the verdicts of their mutants, in report order.
   */
  mutators: IndexedMutator[]

  /**
   * Files, the lowest score first, then the most survivors, then by path.
   */
  worstFiles: IndexedFile[]

  /**
   * Mutants of the report, in report order.
   */
  mutants: IndexedMutant[]

  /**
   * Files in report order.
   */
  files: IndexedFile[]

  /**
   * Mutants of the report by status.
   */
  counts: StatusCounts

  /**
   * Data the page was built from.
   */
  report: HtmlReport
}
