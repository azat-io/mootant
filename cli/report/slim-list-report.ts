import type { SlimListReport } from '../../types/report/slim-list-report'
import type { ListReport } from '../../types/report/list-report'

import { slimListMutant } from './slim-list-mutant'
import { slimFocus } from './slim-focus'

/**
 * Shapes a list report as `--json` prints it: the schema version, diagnostics,
 * command, summary, preset and `--since` revision when given, then, last, so
 * that output cut short keeps the rest, the mutants in their slim form
 * (`slimListMutant`) and the skipped candidates with `--skipped`, without their
 * offsets and a missing justifier. Mutator descriptions and files stay in the
 * full report, which `--json --verbose` prints.
 *
 * @param report - Full report of a list run.
 * @returns Report as `--json` prints it.
 */
export function slimListReport(report: ListReport): SlimListReport {
  let mutants = report.mutants.map(mutant => slimListMutant(mutant))
  return {
    schemaVersion: report.schemaVersion,
    diagnostics: report.diagnostics,
    command: report.command,
    summary: report.summary,
    preset: report.preset,
    ...(report.since !== null && { since: report.since }),
    mutants,
    ...(report.skipped && {
      skipped: report.skipped.map(({ start, focus, end, by, ...rest }) => ({
        ...rest,
        ...(focus && { focus: slimFocus(focus) }),
        ...(by !== null && { by }),
      })),
    }),
  }
}
