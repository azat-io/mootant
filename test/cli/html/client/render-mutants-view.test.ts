import { describe, expect, it } from 'vitest'

import { renderMutantsView } from '../../../../cli/html/client/render-mutants-view'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderMutantsView', () => {
  it('offers a filter for each status of the run and the text filter', () => {
    let html = renderMutantsView(indexReport(createHtmlReport()), {
      filter: 'Timeout',
      mutator: null,
      query: '<x>',
      limit: 200,
    })

    expect(squashHtml(html)).toContain(
      squashHtml(
        'data-mutants-filter="all" aria-pressed="false">All <span class="count">6</span>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        'data-mutants-filter="Timeout" aria-pressed="true"><span class="dot status-timeout"></span>Timeout <span class="count">1</span>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('value="&lt;x&gt;" data-mutants-query'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<p class="empty">No mutant matches.</p>'),
    )
    expect(squashHtml(html)).not.toContain(squashHtml('mutator-filter'))
  })

  it('names the mutator the page is narrowed to', () => {
    let html = renderMutantsView(indexReport(createHtmlReport()), {
      mutator: 'arithmetic-operator',
      filter: 'all',
      limit: 200,
      query: '',
    })

    expect(squashHtml(html)).toContain(
      squashHtml(
        '<span class="mutator-filter">mutator <code>arithmetic-operator</code><button class="mutator-clear" type="button" data-clear-mutator aria-label="Show every mutator">',
      ),
    )
    expect(html.match(/<tr data-href/gu)).toHaveLength(2)
  })
})
