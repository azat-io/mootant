import { describe, expect, it } from 'vitest'

import type { ListReport } from '../../../types/report/list-report'

import { createListReportMutant } from '../../helpers/create-list-report-mutant'
import { formatTextReport } from '../../../cli/report/format-text-report'
import { slimListReport } from '../../../cli/report/slim-list-report'
import { createListReport } from '../../helpers/create-list-report'
import { createTextStyle } from '../../helpers/create-text-style'
import { formatReport } from '../../../cli/report/format-report'

/**
 * Report of a run with one pending mutant and one warning.
 */
let report: ListReport = {
  ...createListReport([createListReportMutant({ scope: 'unit' })], {
    totalWarnings: 1,
  }),
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
}

/**
 * Command and style of the text format.
 */
let options = {
  command: 'mootant list src',
  style: createTextStyle(),
  verbose: false,
}

describe('formatReport', () => {
  it('formats the report as text', () => {
    expect(formatReport(report, 'text', options)).toBe(
      formatTextReport(report, options),
    )
  })

  it('formats the slim report as compact JSON', () => {
    let json = formatReport(report, 'json', options)

    expect(json).toBe(JSON.stringify(slimListReport(report)))
  })

  it('formats the full report as compact JSON when verbose', () => {
    let json = formatReport(report, 'json', { ...options, verbose: true })

    expect(json).toBe(JSON.stringify(report))
    expect(JSON.parse(json)).toStrictEqual(report)
  })
})
