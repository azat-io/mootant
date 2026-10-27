import type { HtmlReport } from '../../types/report/html-report'

/**
 * Turns the data of the HTML report into JSON that a `<script
 * type="application/json">` element holds as it is: every `<` is written as a
 * JSON escape, so no `</script>` or `<!--` in a source file or a message can
 * end the element or start a comment.
 *
 * @param report - Packed run report with sources and tests.
 * @returns JSON text without a raw `<`.
 */
export function serializeReportData(report: HtmlReport): string {
  return JSON.stringify(report).replaceAll('<', String.raw`\u003c`)
}
