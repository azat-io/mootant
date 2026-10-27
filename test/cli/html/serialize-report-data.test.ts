import { describe, expect, it } from 'vitest'

import { serializeReportData } from '../../../cli/html/serialize-report-data'
import { createHtmlReport } from '../../helpers/create-html-report'

describe('serializeReportData', () => {
  it('escapes what could end the script element or open a comment', () => {
    let report = createHtmlReport()
    report.files[0]!.source = '</script><!-- \u{2028}'
    let json = serializeReportData(report)

    expect(json).not.toContain('<')
    expect(json).toContain('\\u003c/script>\\u003c!-- \u{2028}')
    expect(JSON.parse(json)).toStrictEqual(report)
  })
})
