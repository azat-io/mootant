import { describe, expect, it } from 'vitest'

import { formatRunTextReport } from '../../../cli/report/format-run-text-report'
import { formatRunReport } from '../../../cli/report/format-run-report'
import { buildRunReport } from '../../../cli/report/build-run-report'
import { slimRunReport } from '../../../cli/report/slim-run-report'
import { createTextStyle } from '../../helpers/create-text-style'
import { createRunResult } from '../../helpers/create-run-result'

/**
 * Command, style and verbosity of the text format.
 */
let options = {
  command: 'mootant run src',
  recheck: 'mootant run src',
  style: createTextStyle(),
  verbose: false,
  idLength: 4,
}

describe('formatRunReport', () => {
  it('formats the text report', () => {
    let report = buildRunReport(createRunResult(), {
      recheck: 'mootant run src',
      all: true,
    })

    expect(formatRunReport(report, 'text', options)).toBe(
      formatRunTextReport(report, options),
    )
  })

  it('prints the slim report as compact JSON', () => {
    let report = buildRunReport(createRunResult(), {
      recheck: 'mootant run src',
      all: true,
    })

    let text = formatRunReport(report, 'json', options)

    expect(text).toBe(JSON.stringify(slimRunReport(report)))
  })

  it('prints the full report as compact JSON when verbose', () => {
    let report = buildRunReport(createRunResult(), {
      recheck: 'mootant run src',
      all: true,
    })

    let text = formatRunReport(report, 'json', { ...options, verbose: true })

    expect(text).toBe(JSON.stringify(report))
    expect(JSON.parse(text)).toStrictEqual(report)
  })
})
