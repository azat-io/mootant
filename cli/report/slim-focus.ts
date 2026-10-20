import type { ListReportFocus } from '../../types/report/list-report-focus'
import type { SlimReportFocus } from '../../types/report/slim-list-report'

/**
 * Shapes the focus of a mutant or skipped candidate for a slim report: its
 * position and texts, without offsets.
 *
 * @param focus - Focus of the full report.
 * @returns The focus without `start` and `end`.
 */
export function slimFocus(focus: ListReportFocus): SlimReportFocus {
  return {
    replacement: focus.replacement,
    original: focus.original,
    column: focus.column,
    line: focus.line,
  }
}
