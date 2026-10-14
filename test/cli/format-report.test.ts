import { describe, expect, it } from 'vitest'

import type { ListReport } from '../../types/list-report'

import { formatTextReport } from '../../cli/format-text-report'
import { formatReport } from '../../cli/format-report'

/**
 * Report of a run with one pending mutant and one warning.
 */
let report: ListReport = {
  mutants: [
    {
      description: 'Empties a string literal.',
      sourceLine: "let unit = 'cm'",
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
  schemaVersion: 1,
  command: 'list',
}

describe('formatReport', () => {
  it('formats the report as text', () => {
    expect(formatReport(report, 'text')).toBe(formatTextReport(report))
  })

  it('formats the report as indented JSON', () => {
    let json = formatReport(report, 'json')

    expect(json).toBe(JSON.stringify(report, null, 2))
    expect(JSON.parse(json)).toStrictEqual(report)
  })
})
