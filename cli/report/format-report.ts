import type { ListReport } from '../../types/report/list-report'
import type { ListTextOptions } from './format-text-report'

import { formatTextReport } from './format-text-report'
import { slimListReport } from './slim-list-report'

/**
 * Output format of a report. A Markdown format joins this union later.
 */
export type ReportFormat = 'json' | 'text'

/**
 * Formatter of every report format; the compiler rejects a missing format.
 */
let formatters: Record<
  ReportFormat,
  (report: ListReport, options: ListTextOptions) => string
> = {
  json: (report, options) =>
    JSON.stringify(options.verbose ? report : slimListReport(report)),
  text: formatTextReport,
}

/**
 * Formats a report for printing.
 *
 * @param report - Report of a list run.
 * @param format - Requested output format.
 * @param options - Command and style of the text format; whether JSON prints
 *   the full report or the slim one (`slimListReport`).
 * @returns Text printed to stdout.
 */
export function formatReport(
  report: ListReport,
  format: ReportFormat,
  options: ListTextOptions,
): string {
  return formatters[format](report, options)
}
