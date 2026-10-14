import type { ListReport } from '../types/list-report'

import { formatTextReport } from './format-text-report'

/**
 * Output format of a report. A Markdown format joins this union later.
 */
export type ReportFormat = 'json' | 'text'

/**
 * Formatter of every report format; the compiler rejects a missing format.
 */
let formatters: Record<ReportFormat, (report: ListReport) => string> = {
  json: report => JSON.stringify(report, null, 2),
  text: formatTextReport,
}

/**
 * Formats a report for printing.
 *
 * @param report - Report of a list run.
 * @param format - Requested output format.
 * @returns Text printed to stdout.
 */
export function formatReport(report: ListReport, format: ReportFormat): string {
  return formatters[format](report)
}
