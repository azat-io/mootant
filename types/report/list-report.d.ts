import type { ListReportMutator } from './list-report-mutator'
import type { ListReportSummary } from './list-report-summary'
import type { ListReportSkipped } from './list-report-skipped'
import type { ListReportMutant } from './list-report-mutant'
import type { ListReportFile } from './list-report-file'
import type { Diagnostic } from '../mutant/diagnostic'

/**
 * Result of `mootant list`, shaped for AI agents. `--json` prints it as is.
 */
export interface ListReport {
  /**
   * Mutators the preset turned on, in canonical order.
   */
  mutators: ListReportMutator[]

  /**
   * Candidates that were considered and not emitted, in canonical order per
   * file. Present only with `--skipped`; they never change `mutants`.
   */
  skipped?: ListReportSkipped[]

  /**
   * Mutants of every file, in canonical order.
   */
  mutants: ListReportMutant[]

  /**
   * Counts of the whole run.
   */
  summary: ListReportSummary

  /**
   * Problems sorted by file, line, column, code and message; problems of the
   * run first.
   */
  diagnostics: Diagnostic[]

  /**
   * Listed files, sorted by path.
   */
  files: ListReportFile[]

  /**
   * Version of this schema. It changes when a field changes meaning or is
   * removed; new fields do not change it.
   */
  schemaVersion: 1

  /**
   * Command that produced the report.
   */
  command: 'list'

  /**
   * Id of the preset used.
   */
  preset: string
}
