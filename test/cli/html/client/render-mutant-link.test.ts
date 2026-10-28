import { describe, expect, it } from 'vitest'

import { renderMutantLink } from '../../../../cli/html/client/render-mutant-link'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderMutantLink', () => {
  let index = indexReport(createHtmlReport())

  it('links to the mutant with the dot of its status, its mutator, change and status', () => {
    let html = renderMutantLink(index, index.byId.get('survived0001')!)

    expect(squashHtml(html)).toBe(
      squashHtml(
        '<li><a class="also-link" href="#/mutant/survived0001"><span class="dot status-survived"></span><span class="grow"><code>comparison-operator</code> <span class="change"><span class="before">size &lt; limit</span><span class="arrow" aria-label="becomes">→</span><span class="after">size &lt;= limit</span></span></span><span class="muted">survived</span></a></li>',
      ),
    )
  })

  it('shows a status of two words', () => {
    let html = renderMutantLink(index, index.byId.get('uncovered001')!)

    expect(squashHtml(html)).toContain(
      squashHtml('<span class="dot status-no-coverage"></span>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<span class="muted">no coverage</span>'),
    )
  })
})
