import type { ListReportSummary } from '../types/report/list-report-summary'
import type { ListReport } from '../types/report/list-report'

import { sortByLocation } from './sort-by-location'
import { formatLocation } from './format-location'
import { formatChange } from './format-change'
import { pluralize } from './pluralize'

/**
 * Line of a list before its columns are aligned.
 */
interface Row {
  /**
   * `file:line:column` of the first replaced character.
   */
  location: string

  /**
   * Id of the mutator.
   */
  mutator: string

  /**
   * Text after the mutator column.
   */
  change: string

  /**
   * Text between the location and the mutator, with its trailing separator,
   * such as the id of a mutant.
   */
  middle: string
}

/**
 * Formats a report as one aligned line per mutant, sorted by the position it
 * shows, an empty line and a summary line. With no mutants only the summary
 * line is returned. A report with skipped candidates also gets a `Skipped:`
 * section after the mutants, one aligned line per candidate with its category,
 * rule and reason, and a second summary line that counts them by category.
 *
 * @param report - Report of a list run.
 * @returns Plain text without colors.
 */
export function formatTextReport(report: ListReport): string {
  let summary = formatSummary(report.summary, report.preset)
  let sections: string[] = []
  if (report.mutants.length > 0) {
    sections.push(
      formatRows(
        sortByLocation(report.mutants).map(mutant => ({
          change: `${formatChange(mutant.focus ?? mutant)}${mutant.status === 'Ignored' ? ` (ignored: ${mutant.reason})` : ''}`,
          location: formatLocation(mutant),
          middle: `${mutant.id}  `,
          mutator: mutant.mutator,
        })),
      ),
    )
  }
  if (report.skipped) {
    if (report.skipped.length > 0) {
      let rows = formatRows(
        sortByLocation(report.skipped).map(candidate => ({
          change: `${formatChange(candidate.focus ?? candidate)} (skipped: ${candidate.category} ${candidate.rule}: ${candidate.reason})`,
          location: formatLocation(candidate),
          mutator: candidate.mutator,
          middle: '',
        })),
      )
      sections.push(`Skipped:\n${rows}`)
    }
    summary += `\n${formatSkippedSummary(report.summary)}`
  }
  sections.push(summary)
  return sections.join('\n\n')
}

/**
 * Formats the summary line, naming errors and warnings only when there are
 * some.
 *
 * @param summary - Counts of the run.
 * @param preset - Id of the preset used.
 * @returns One line of text.
 */
function formatSummary(summary: ListReportSummary, preset: string): string {
  let text = `${pluralize(summary.totalMutants, 'mutant')} in ${pluralize(summary.totalFiles, 'file')}: ${summary.totalPending} pending, ${summary.totalIgnored} ignored`
  if (summary.totalErrors > 0) {
    text += `, ${pluralize(summary.totalErrors, 'error')}`
  }
  if (summary.totalWarnings > 0) {
    text += `, ${pluralize(summary.totalWarnings, 'warning')}`
  }
  return `${text} (preset: ${preset})`
}

/**
 * Formats rows with the location and mutator columns aligned.
 *
 * @param rows - Rows of one list.
 * @returns The lines joined with line breaks.
 */
function formatRows(rows: readonly Row[]): string {
  let locationWidth = 0
  let mutatorWidth = 0
  for (let row of rows) {
    locationWidth = Math.max(locationWidth, row.location.length)
    mutatorWidth = Math.max(mutatorWidth, row.mutator.length)
  }
  return rows
    .map(
      row =>
        `${row.location.padEnd(locationWidth)}  ${row.middle}${row.mutator.padEnd(mutatorWidth)}  ${row.change}`,
    )
    .join('\n')
}

/**
 * Formats the line that counts skipped candidates, naming only the categories
 * that have some.
 *
 * @param summary - Counts of a run with skipped candidates.
 * @returns One line of text, such as `3 skipped: 2 equivalent, 1 owned`.
 */
function formatSkippedSummary(summary: ListReportSummary): string {
  let counts = Object.entries(summary.skippedByCategory!)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => `${count} ${category}`)
  let total = `${summary.totalSkipped} skipped`
  return counts.length === 0 ? total : `${total}: ${counts.join(', ')}`
}
