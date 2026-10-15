import type { RunReport } from '../types/report/run-report'
import type { ReportFormat } from './format-report'

import { formatRunTextReport } from './format-run-text-report'

/**
 * Formatter of every report format; the compiler rejects a missing format.
 */
let formatters: Record<ReportFormat, (report: RunReport) => string> = {
  json: report => JSON.stringify(report, null, 2),
  text: formatRunTextReport,
}

/**
 * Formats a run report for printing.
 *
 * @param report - Report of a run.
 * @param format - Requested output format.
 * @returns Text printed to stdout.
 */
export function formatRunReport(
  report: RunReport,
  format: ReportFormat,
): string {
  return formatters[format](report)
}
