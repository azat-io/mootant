import type { ListReportSummary } from '../../types/report/list-report-summary'
import type { ListReport } from '../../types/report/list-report'
import type { TextStyle } from '../../types/cli/text-style'

import { getShortIdLength } from './get-short-id-length'
import { formatFileGroups } from './format-file-groups'
import { sortByLocation } from './sort-by-location'
import { formatHeader } from './format-header'
import { formatFields } from './format-fields'
import { pluralize } from './pluralize'

/**
 * How a list report is printed as text.
 */
export interface ListTextOptions {
  /**
   * Colors, width and symbols of the output.
   */
  style: TextStyle

  /**
   * Command as typed, for the header, such as `mootant list src`.
   */
  command: string
}

/**
 * Formats a list report as text, laid out as a run report: a header with the
 * command and the preset, the counts, then the mutants grouped by file with
 * short ids, an ignored mutant with its reason. A report with skipped
 * candidates also counts them by category and gets a `skipped:` section after
 * the mutants, grouped by file, each candidate with its category, rule and
 * reason.
 *
 * @param report - Report of a list run.
 * @param options - Command and style.
 * @returns Text, with colors when the style has them.
 */
export function formatTextReport(
  report: ListReport,
  options: ListTextOptions,
): string {
  let { style } = options
  let { colors } = style
  let sections = [formatFields(getSummaryFields(report.summary), style)]
  if (report.mutants.length > 0) {
    let idLength = getShortIdLength(report.mutants.map(mutant => mutant.id))
    sections.push(
      formatFileGroups(
        sortByLocation(report.mutants).map(mutant => {
          let position = mutant.focus ?? mutant
          return {
            tail: [
              { text: mutant.id.slice(0, idLength) },
              ...(mutant.status === 'Ignored' ?
                [
                  {
                    text:
                      mutant.reason === null ?
                        'ignored'
                      : `ignored: ${mutant.reason}`,
                    color: colors.gray,
                  },
                ]
              : []),
            ],
            location: `${position.line}:${position.column}`,
            change: mutant.focus ?? mutant,
            mutator: mutant.mutator,
            file: mutant.file,
            details: [],
          }
        }),
        style,
      ),
    )
  }
  if (report.skipped && report.skipped.length > 0) {
    sections.push(
      `${colors.gray('skipped:')}\n\n${formatFileGroups(
        sortByLocation(report.skipped).map(candidate => {
          let position = candidate.focus ?? candidate
          return {
            tail: [
              { text: candidate.category, color: colors.yellow },
              { text: candidate.rule, color: colors.gray },
            ],
            location: `${position.line}:${position.column}`,
            change: candidate.focus ?? candidate,
            details: [candidate.reason],
            mutator: candidate.mutator,
            file: candidate.file,
          }
        }),
        style,
      )}`,
    )
  }
  let body = sections.join('\n\n')
  let note = `preset ${report.preset}`
  return `${formatHeader({ command: options.command, note }, body, style)}\n\n${body}`
}

/**
 * Builds the counts of a list report: mutants with the ignored ones among them,
 * skipped candidates when they were asked for, and errors and warnings only
 * when there are some.
 *
 * @param summary - Counts of the run.
 * @returns Label and value pairs.
 */
function getSummaryFields(
  summary: ListReportSummary,
): [label: string, value: string][] {
  let fields: [label: string, value: string][] = [
    [
      'mutants',
      `${summary.totalMutants} in ${pluralize(summary.totalFiles, 'file')}${summary.totalIgnored > 0 ? `, ${summary.totalIgnored} ignored` : ''}`,
    ],
  ]
  if (summary.skippedByCategory !== undefined) {
    let counts = Object.entries(summary.skippedByCategory)
      .filter(([, count]) => count > 0)
      .map(([category, count]) => `${count} ${category}`)
    fields.push([
      'skipped',
      counts.length === 0 ?
        String(summary.totalSkipped)
      : `${summary.totalSkipped}: ${counts.join(', ')}`,
    ])
  }
  if (summary.totalErrors > 0) {
    fields.push(['errors', String(summary.totalErrors)])
  }
  if (summary.totalWarnings > 0) {
    fields.push(['warnings', String(summary.totalWarnings)])
  }
  return fields
}
