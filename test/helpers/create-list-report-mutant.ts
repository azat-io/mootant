import type { ListReportMutant } from '../../types/report/list-report-mutant'

/**
 * Builds a pending mutant of a list report that empties the string on the first
 * line of `example.ts`, `let unit = 'cm'`.
 *
 * @param fields - Fields that differ from the defaults: a top-level
 *   `string-literal` mutant with the id `000000000001` at 1:12, its line not
 *   cut.
 * @returns Mutant as the report holds it.
 */
export function createListReportMutant(
  fields: Partial<ListReportMutant> = {},
): ListReportMutant {
  return {
    before: ["let unit = 'cm'"],
    mutator: 'string-literal',
    after: ["let unit = ''"],
    id: '000000000001',
    kind: 'expression',
    file: 'example.ts',
    status: 'Pending',
    replacement: "''",
    original: "'cm'",
    ignoredBy: null,
    endColumn: 16,
    reason: null,
    cutStart: 0,
    scope: null,
    column: 12,
    endLine: 1,
    cutEnd: 0,
    start: 11,
    line: 1,
    end: 15,
    ...fields,
  }
}
