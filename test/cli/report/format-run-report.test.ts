import { describe, expect, it } from 'vitest'

import { formatRunTextReport } from '../../../cli/report/format-run-text-report'
import { formatRunReport } from '../../../cli/report/format-run-report'
import { slimRunReport } from '../../../cli/report/slim-run-report'
import { createTextStyle } from '../../helpers/create-text-style'
import { createRunReport } from '../../helpers/create-run-report'

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
    let report = createRunReport()

    expect(formatRunReport(report, 'text', options)).toBe(
      formatRunTextReport(report, options),
    )
  })

  it('prints the slim report as compact JSON', () => {
    let report = createRunReport()

    let text = formatRunReport(report, 'json', options)

    expect(text).toBe(JSON.stringify(slimRunReport(report)))
  })

  it('prints the full report as compact JSON when verbose', () => {
    let report = createRunReport()

    let text = formatRunReport(report, 'json', { ...options, verbose: true })

    expect(text).toBe(JSON.stringify(report))
    expect(JSON.parse(text)).toStrictEqual(report)
  })
})
