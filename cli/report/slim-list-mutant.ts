import type { SlimListReportMutant } from '../../types/report/slim-list-report'
import type { ListReportMutant } from '../../types/report/list-report-mutant'

import { slimFocus } from './slim-focus'
import { slimDiff } from './slim-diff'

/**
 * Shapes a mutant for a slim report: id, position, mutator, status and source
 * lines before and after the change, with the scope, focus, ignore directive
 * and reason only when they are set. Offsets, end position, kind, the original
 * and replacement texts and the cut lengths are left out; the source lines show
 * `…` where they were cut (`slimDiff`).
 *
 * @param mutant - Mutant of a full report, of a list or a run.
 * @returns The slim mutant, with the status of the given one.
 */
export function slimListMutant<Status extends string>(
  mutant: Omit<ListReportMutant, 'status'> & { status: Status },
): Omit<SlimListReportMutant, 'status'> & { status: Status } {
  return {
    ...(mutant.scope !== null && { scope: mutant.scope }),
    ...(mutant.focus && { focus: slimFocus(mutant.focus) }),
    ...(mutant.ignoredBy !== null && { ignoredBy: mutant.ignoredBy }),
    ...(mutant.reason !== null && { reason: mutant.reason }),
    mutator: mutant.mutator,
    column: mutant.column,
    status: mutant.status,
    ...slimDiff(mutant),
    file: mutant.file,
    line: mutant.line,
    id: mutant.id,
  }
}
