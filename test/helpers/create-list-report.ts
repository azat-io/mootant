import type { ListReportSummary } from '../../types/report/list-report-summary'
import type { ListReportMutant } from '../../types/report/list-report-mutant'
import type { ListReport } from '../../types/report/list-report'

/**
 * Builds the report of `mootant list` with the given mutants and the counts,
 * mutator and file of one pending `string-literal` mutant of `example.ts`.
 *
 * @param mutants - Mutants to list, already in canonical order.
 * @param summary - Counts that differ from one pending mutant in one file.
 * @returns Report of the `recommended` preset without diagnostics.
 */
export function createListReport(
  mutants: ListReportMutant[],
  summary: Partial<ListReportSummary> = {},
): ListReport {
  return {
    summary: {
      totalWarnings: 0,
      totalMutants: 1,
      totalPending: 1,
      totalIgnored: 0,
      totalErrors: 0,
      totalFiles: 1,
      ...summary,
    },
    mutators: [
      {
        description: 'Empties a string literal.',
        id: 'string-literal',
        mutants: 1,
      },
    ],
    files: [{ file: 'example.ts', parsed: true, mutants: 1 }],
    preset: 'recommended',
    schemaVersion: 3,
    command: 'list',
    diagnostics: [],
    since: null,
    mutants,
  }
}
