import { describe, expect, it } from 'vitest'

import { renderSkippedSummary } from '../../../../cli/html/client/render-skipped-summary'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderSkippedSummary', () => {
  it('shows a card for each category with its common reasons', () => {
    let report = createHtmlReport()
    let [skip] = report.skipped
    report.texts.push('the same constant', 'another reason')
    report.skipped.push(
      { ...skip!, category: 'owned', rule: 'O1', reason: 4 },
      { ...skip!, category: 'owned', rule: 'O1', reason: 4 },
      { ...skip!, category: 'owned', rule: 'O3', reason: 5 },
      { ...skip!, category: 'owned', rule: 'O4', reason: 5 },
    )
    let html = renderSkippedSummary(indexReport(report))

    expect(squashHtml(html)).toContain(
      squashHtml('Mootant considered 11 changes and ran 6. The other 5'),
    )
    expect(html.indexOf('<h3>owned</h3>')).toBeLessThan(
      html.indexOf('<h3>equivalent</h3>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<strong class="skip-count">4</strong>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<li><span class="reason-count">2</span><span>The same constant <span class="rule">O1</span></span></li>',
      ),
    )
    expect(html.match(/<li>/gu)).toHaveLength(3)
  })

  it('renders nothing without skipped candidates', () => {
    let report = createHtmlReport()
    report.skipped = []

    expect(renderSkippedSummary(indexReport(report))).toBe('')
  })
})
