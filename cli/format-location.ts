import type { ListReportFocus } from '../types/report/list-report-focus'

/**
 * Formats where a report entry is as `file:line:column`: the position of its
 * focus when it has one, otherwise of its range.
 *
 * @param entry - Mutant or skipped candidate of a report.
 * @param entry.focus - Changed part of the range, if any.
 * @param entry.column - 1-based column of the range.
 * @param entry.line - 1-based line of the range.
 * @param entry.file - Path of the file.
 * @returns The location on one line.
 */
export function formatLocation(entry: {
  focus?: ListReportFocus
  column: number
  line: number
  file: string
}): string {
  let { column, line } = entry.focus ?? entry
  return `${entry.file}:${line}:${column}`
}
