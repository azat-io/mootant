import type { ListReportSummary } from './list-report-summary'
import type { ListReportSkipped } from './list-report-skipped'
import type { ListReportMutant } from './list-report-mutant'
import type { SinceRevision } from '../git/since-revision'
import type { ListReportFocus } from './list-report-focus'
import type { Diagnostic } from '../mutant/diagnostic'

/**
 * Result of `mootant list` as `--json` prints it: the fields of the full report
 * (`ListReport`) an agent needs, without offsets, mutator descriptions, files,
 * the original and replacement texts and fields that are null. Every field has
 * the meaning it has in the full report, which `--json --verbose` prints.
 */
export interface SlimListReport {
  /**
   * Candidates that were considered and not emitted. Present only with
   * `--skipped`.
   */
  skipped?: SlimListReportSkipped[]

  /**
   * Mutants of every file, in canonical order.
   */
  mutants: SlimListReportMutant[]

  /**
   * Counts of the whole run.
   */
  summary: ListReportSummary

  /**
   * Problems sorted by file, line, column, code and message.
   */
  diagnostics: Diagnostic[]

  /**
   * Revision given with `--since` and its merge base; left out without it.
   */
  since?: SinceRevision

  /**
   * Version of the report shape, the same as of the full report.
   */
  schemaVersion: 3

  /**
   * Command that produced the report.
   */
  command: 'list'

  /**
   * Id of the preset used.
   */
  preset: string
}

/**
 * Mutant of the slim list report: where it is, what it changes and whether it
 * is ignored. Its source lines are those of the full report with a `…` where
 * text was left out: at the start of the first line of both sides when the full
 * report cut it there (`cutStart`), at the end of the last line when it cut it
 * there (`cutEnd`).
 */
export interface SlimListReportMutant extends Pick<
  ListReportMutant,
  'mutator' | 'before' | 'column' | 'status' | 'after' | 'file' | 'line' | 'id'
> {
  /**
   * Ignore directive comment that excluded the mutant; left out while pending.
   */
  ignoredBy?: NonNullable<ListReportMutant['ignoredBy']>

  /**
   * Part of the range the change amounts to, when the mutator names one.
   */
  focus?: SlimReportFocus

  /**
   * Reason of the ignore directive; left out when it has none.
   */
  reason?: string

  /**
   * Dotted names of the declarations around the mutant; left out at the top
   * level.
   */
  scope?: string
}

/**
 * Skipped candidate of the slim list report, without offsets.
 */
export interface SlimListReportSkipped extends Omit<
  ListReportSkipped,
  'focus' | 'start' | 'end' | 'by'
> {
  /**
   * Mutant that justifies the skip; left out when no single mutant does.
   */
  by?: NonNullable<ListReportSkipped['by']>

  /**
   * Part of the range the change amounts to, when the mutator names one.
   */
  focus?: SlimReportFocus
}

/**
 * Part of a mutant's range that the mutant changes, without offsets.
 */
export type SlimReportFocus = Omit<ListReportFocus, 'start' | 'end'>
