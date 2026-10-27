import { describe, expect, it } from 'vitest'

import { formatHtmlReport } from '../../../cli/html/format-html-report'
import { createHtmlReport } from '../../helpers/create-html-report'

describe('formatHtmlReport', () => {
  it('builds one file with the styles, fonts, data and client of the report', () => {
    let report = createHtmlReport()
    report.meta.project = '<cart>'
    let html = formatHtmlReport(report)

    expect(html).toMatch(
      /^<!doctype html>\n<html lang="en" data-theme="light">/u,
    )
    expect(html).toContain('<title>&lt;cart&gt; · mootant report</title>')
    expect(html).toContain('<meta name="generator" content="mootant 1.2.3">')
    expect(html).toContain("localStorage.getItem('mootant-report-theme')")
    expect(html).toContain('--color-background-brand')
    expect(html).toContain('--space-xs')
    expect(html).toContain('--font-size-2xs')
    expect(html).toContain('.files-layout')
    expect(html).not.toContain("url('/fonts/")
    expect(html.match(/src:url\(data:font\/woff2;base64,/gu)).toHaveLength(3)
    expect(html).toContain(
      '<script type="application/json" id="report-data">{"meta":',
    )
    expect(html).toContain(String.raw`"project":"\u003ccart>"`)
    expect(html.match(/<\/script>/gu)).toHaveLength(3)
    expect(html).toMatch(/<\/body>\n<\/html>\n$/u)
  })
})
