import type { ListReportSummary } from '../types/list-report-summary'
import type { ListReport } from '../types/list-report'

/**
 * Longest fragment shown as is; longer fragments are cut.
 */
const MAX_FRAGMENT_LENGTH = 60

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
 * Formats a report as one aligned line per mutant, an empty line and a summary
 * line. With no mutants only the summary line is returned. A report with
 * skipped candidates also gets a `Skipped:` section after the mutants, one
 * aligned line per candidate with its category, rule and reason, and a second
 * summary line that counts them by category.
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
        report.mutants.map(mutant => ({
          change: `${formatChange(mutant)}${mutant.status === 'Ignored' ? ` (ignored: ${mutant.reason})` : ''}`,
          location: `${mutant.file}:${mutant.line}:${mutant.column}`,
          middle: `${mutant.id}  `,
          mutator: mutant.mutator,
        })),
      ),
    )
  }
  if (report.skipped) {
    if (report.skipped.length > 0) {
      let rows = formatRows(
        report.skipped.map(candidate => ({
          change: `${formatChange(candidate)} (skipped: ${candidate.category} ${candidate.rule}: ${candidate.reason})`,
          location: `${candidate.file}:${candidate.line}:${candidate.column}`,
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
 * Shows a source fragment on one line: runs of whitespace become one space,
 * long texts are cut without splitting an astral character, and an empty text
 * is named.
 *
 * @param text - Original or replacement text of a mutant.
 * @returns Text that fits a report line.
 */
function shortenFragment(text: string): string {
  let collapsed = text.replaceAll(/\s+/gu, ' ').trim()
  if (collapsed === '') {
    return '(empty)'
  }
  if (collapsed.length <= MAX_FRAGMENT_LENGTH) {
    return collapsed
  }
  let cut = MAX_FRAGMENT_LENGTH - 3
  if (collapsed.codePointAt(cut - 1)! > 0xff_ff) {
    cut -= 1
  }
  return `${collapsed.slice(0, cut)}...`
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

/**
 * Formats the change of a mutant or skipped candidate as `original ->
 * replacement`.
 *
 * @param entry - Original and replacement texts.
 * @returns The change on one line.
 */
function formatChange(entry: {
  replacement: string
  original: string
}): string {
  return `${shortenFragment(entry.original)} -> ${shortenFragment(entry.replacement)}`
}

/**
 * Joins a count and a noun, adding `s` unless the count is one.
 *
 * @param count - Number of things.
 * @param noun - Singular noun.
 * @returns Text such as `1 file` or `2 files`.
 */
function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
