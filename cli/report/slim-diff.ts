import type { ListReportDiff } from '../../types/report/list-report-diff'

/**
 * Character a slim report writes where the full report left out text of a long
 * source line. One UTF-16 code unit.
 */
const CUT_MARK = '…'

/**
 * Shapes the source lines of a mutant for a slim report, which leaves out the
 * cut lengths: both sides with a `…` at the start of the first line when the
 * full report cut it at its start, and at the end of the last line when it cut
 * it at its end.
 *
 * @param diff - Source lines of the full report with the cut lengths.
 * @returns Lines before and after the mutant, marked where they were cut.
 */
export function slimDiff(
  diff: ListReportDiff,
): Pick<ListReportDiff, 'before' | 'after'> {
  let before = [...diff.before]
  let after = [...diff.after]
  for (let lines of [before, after]) {
    if (diff.cutStart > 0) {
      lines[0] = `${CUT_MARK}${lines[0]}`
    }
    if (diff.cutEnd > 0) {
      lines[lines.length - 1] = `${lines.at(-1)}${CUT_MARK}`
    }
  }
  return { before, after }
}
