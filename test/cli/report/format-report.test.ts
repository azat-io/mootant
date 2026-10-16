import { describe, expect, it } from 'vitest'

import type { ListReport } from '../../../types/report/list-report'

import { formatTextReport } from '../../../cli/report/format-text-report'
import { createTextStyle } from '../../helpers/create-text-style'
import { formatReport } from '../../../cli/report/format-report'

/**
 * Report of a run with one pending mutant and one warning.
 */
let report: ListReport = {
  mutants: [
    {
      diff: {
        before: ["let unit = 'cm'"],
        after: ["let unit = ''"],
        cutStart: 0,
        cutEnd: 0,
      },
      mutator: 'string-literal',
      id: '000000000001',
      kind: 'expression',
      file: 'example.ts',
      status: 'Pending',
      replacement: "''",
      original: "'cm'",
      ignoredBy: null,
      endColumn: 16,
      scope: 'unit',
      reason: null,
      column: 12,
      endLine: 1,
      start: 11,
      line: 1,
      end: 15,
    },
  ],
  diagnostics: [
    {
      message: 'Skipped notes.md: not a JavaScript or TypeScript source file.',
      code: 'skipped-path',
      severity: 'warning',
      column: null,
      file: null,
      line: null,
    },
  ],
  summary: {
    totalWarnings: 1,
    totalMutants: 1,
    totalPending: 1,
    totalIgnored: 0,
    totalErrors: 0,
    totalFiles: 1,
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
  schemaVersion: 2,
  command: 'list',
}

/**
 * Command and style of the text format.
 */
let options = { command: 'mootant list src', style: createTextStyle() }

describe('formatReport', () => {
  it('formats the report as text', () => {
    expect(formatReport(report, 'text', options)).toBe(
      formatTextReport(report, options),
    )
  })

  it('formats the report as compact JSON', () => {
    let json = formatReport(report, 'json', options)

    expect(json).toBe(JSON.stringify(report))
    expect(JSON.parse(json)).toStrictEqual(report)
  })
})
