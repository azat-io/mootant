import { describe, expect, it } from 'vitest'

import { formatRunTextReport } from '../../cli/format-run-text-report'
import { createRunResult } from '../helpers/create-run-result'
import { formatRunReport } from '../../cli/format-run-report'
import { buildRunReport } from '../../cli/build-run-report'

describe('formatRunReport', () => {
  it('formats the text report', () => {
    let report = buildRunReport(createRunResult())

    expect(formatRunReport(report, 'text')).toBe(formatRunTextReport(report))
  })

  it('prints the report as indented JSON', () => {
    let report = buildRunReport(createRunResult())

    let text = formatRunReport(report, 'json')

    expect(text).toBe(JSON.stringify(report, null, 2))
    expect(JSON.parse(text)).toStrictEqual(report)
  })
})
