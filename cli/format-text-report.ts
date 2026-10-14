import type { ListReportSummary } from '../types/list-report-summary'
import type { ListReport } from '../types/list-report'

/**
 * Longest fragment shown as is; longer fragments are cut.
 */
const MAX_FRAGMENT_LENGTH = 60

/**
 * Formats a report as one aligned line per mutant, an empty line and a summary
 * line. With no mutants only the summary line is returned.
 *
 * @param report - Report of a list run.
 * @returns Plain text without colors.
 */
export function formatTextReport(report: ListReport): string {
  let summary = formatSummary(report.summary, report.preset)
  if (report.mutants.length === 0) {
    return summary
  }

  let locations: string[] = []
  let locationWidth = 0
  let mutatorWidth = 0
  for (let mutant of report.mutants) {
    let location = `${mutant.file}:${mutant.line}:${mutant.column}`
    locations.push(location)
    locationWidth = Math.max(locationWidth, location.length)
    mutatorWidth = Math.max(mutatorWidth, mutant.mutator.length)
  }

  let lines = report.mutants.map((mutant, index) => {
    let location = locations[index]!.padEnd(locationWidth)
    let mutator = mutant.mutator.padEnd(mutatorWidth)
    let change = `${shortenFragment(mutant.original)} -> ${shortenFragment(mutant.replacement)}`
    let suffix =
      mutant.status === 'Ignored' ? ` (ignored: ${mutant.reason})` : ''
    return `${location}  ${mutant.id}  ${mutator}  ${change}${suffix}`
  })
  return `${lines.join('\n')}\n\n${summary}`
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
 * Joins a count and a noun, adding `s` unless the count is one.
 *
 * @param count - Number of things.
 * @param noun - Singular noun.
 * @returns Text such as `1 file` or `2 files`.
 */
function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
