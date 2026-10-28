import { describe, expect, it } from 'vitest'

import { createListReportMutant } from '../../helpers/create-list-report-mutant'
import { slimListReport } from '../../../cli/report/slim-list-report'
import { slimListMutant } from '../../../cli/report/slim-list-mutant'
import { createListReport } from '../../helpers/create-list-report'

/**
 * Report of a list run with one pending mutant and no skipped candidates.
 */
let report = createListReport([createListReportMutant({ scope: 'unit' })])

describe('slimListReport', () => {
  it('keeps the counts, diagnostics and slim mutants, without mutators, files and null fields', () => {
    expect(slimListReport(report)).toStrictEqual({
      mutants: [slimListMutant(report.mutants[0]!)],
      summary: report.summary,
      preset: 'recommended',
      schemaVersion: 3,
      command: 'list',
      diagnostics: [],
    })
  })

  it('puts the mutants and the skipped candidates last, after the counts and diagnostics', () => {
    let slim = slimListReport({
      ...report,
      since: { base: 'abc123', ref: 'main' },
      skipped: [],
    })

    expect(Object.keys(slim)).toStrictEqual([
      'schemaVersion',
      'diagnostics',
      'command',
      'summary',
      'preset',
      'since',
      'mutants',
      'skipped',
    ])
  })

  it('keeps the revision of --since and the skipped candidates without offsets', () => {
    let slim = slimListReport({
      ...report,
      skipped: [
        {
          focus: {
            replacement: '',
            original: 'cm',
            column: 13,
            start: 12,
            line: 1,
            end: 14,
          },
          by: {
            mutator: 'string-literal',
            id: '000000000001',
            column: 12,
            line: 1,
          },
          reason: 'The listed mutant already empties it.',
          mutator: 'string-literal',
          category: 'duplicate',
          file: 'example.ts',
          rule: 'duplicate',
          replacement: "''",
          heuristic: false,
          original: "'cm'",
          column: 12,
          start: 11,
          line: 1,
          end: 15,
        },
        {
          reason: 'Nothing observes it.',
          category: 'equivalent',
          mutator: 'condition',
          replacement: 'true',
          file: 'example.ts',
          heuristic: true,
          original: 'ok',
          rule: 'E1',
          column: 1,
          start: 0,
          by: null,
          line: 1,
          end: 2,
        },
      ],
      since: { base: 'abc123', ref: 'main' },
    })

    expect(slim.since).toStrictEqual({ base: 'abc123', ref: 'main' })
    expect(slim.skipped).toStrictEqual([
      {
        by: {
          mutator: 'string-literal',
          id: '000000000001',
          column: 12,
          line: 1,
        },
        focus: { replacement: '', original: 'cm', column: 13, line: 1 },
        reason: 'The listed mutant already empties it.',
        mutator: 'string-literal',
        category: 'duplicate',
        file: 'example.ts',
        rule: 'duplicate',
        replacement: "''",
        heuristic: false,
        original: "'cm'",
        column: 12,
        line: 1,
      },
      {
        reason: 'Nothing observes it.',
        category: 'equivalent',
        mutator: 'condition',
        replacement: 'true',
        file: 'example.ts',
        heuristic: true,
        original: 'ok',
        rule: 'E1',
        column: 1,
        line: 1,
      },
    ])
  })
})
