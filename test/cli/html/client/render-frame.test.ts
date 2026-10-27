import { describe, expect, it } from 'vitest'

import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { renderFrame } from '../../../../cli/html/client/render-frame'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderFrame', () => {
  it('renders the header, tabs, footer and search dialog', () => {
    let report = createHtmlReport()
    report.meta.project = '<cart>'
    let html = renderFrame(indexReport(report))

    expect(squashHtml(html)).toContain(squashHtml('<svg class="wordmark"'))
    expect(squashHtml(html)).toContain(
      squashHtml('<span class="badge">v1.2.3</span>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<span class="project-name">&lt;cart&gt;</span>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<span class="project-command">mootant run src --html</span>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<a class="tab" href="#/" data-tab="overview">Overview</a>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<a class="tab" href="#/files" data-tab="files">Files <span class="count">1</span></a>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('Mutants <span class="count">6</span>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('Mutators <span class="count">5</span>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('Tests <span class="count">3</span>'),
    )
    expect(squashHtml(html)).toContain(squashHtml('<main id="main"></main>'))
    expect(squashHtml(html)).toContain(
      squashHtml('mootant 1.2.3 · &lt;cart&gt; · '),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<dialog class="dialog" id="search"'),
    )
  })
})
