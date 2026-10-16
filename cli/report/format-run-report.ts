import type { RunTextOptions } from './format-run-text-report'
import type { RunReport } from '../../types/report/run-report'
import type { ReportFormat } from './format-report'

import { formatRunTextReport } from './format-run-text-report'

/**
 * Formatter of every report format; the compiler rejects a missing format.
 */
let formatters: Record<
  ReportFormat,
  (report: RunReport, options: RunTextOptions) => string
> = {
  json: report => JSON.stringify(report),
  text: formatRunTextReport,
}

/**
 * Formats a run report for printing.
 *
 * @param report - Report of a run.
 * @param format - Requested output format.
 * @param options - Command, style and verbosity of the text format; JSON
 *   ignores them.
 * @returns Text printed to stdout.
 */
export function formatRunReport(
  report: RunReport,
  format: ReportFormat,
  options: RunTextOptions,
): string {
  return formatters[format](report, options)
}
