import { describe, expect, it } from 'vitest'

import { renderFilePanel } from '../../../../cli/html/client/render-file-panel'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderFilePanel', () => {
  it('tells what to look at, lists mutators by survivors and skips by category', () => {
    let index = indexReport(createHtmlReport())
    let html = renderFilePanel(index, index.files[0]!)

    expect(squashHtml(html)).toContain(
      squashHtml('3 mutants to look at. Press <kbd>j</kbd> for the first one.'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<dl class="fields mutator-fields"><dt><code title="comparison-operator">comparison-operator</code></dt><dd>1<span class="tally status-survived" title="1 survived">1</span></dd><dt><code title="arithmetic-operator">arithmetic-operator</code></dt><dd>2</dd>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<dt>equivalent</dt><dd>1</dd>'),
    )
  })

  it('shows a file whose mutants are all detected and that has no skips', () => {
    let report = createHtmlReport()
    report.mutants = report.mutants.slice(0, 1)
    report.skipped = []
    let index = indexReport(report)
    let html = renderFilePanel(index, index.files[0]!)

    expect(squashHtml(html)).toContain(
      squashHtml('Every mutant of this file is detected.'),
    )
    expect(squashHtml(html)).not.toContain(squashHtml('Left out here'))

    report.mutants = []
    let empty = indexReport(report)

    expect(squashHtml(renderFilePanel(empty, empty.files[0]!))).not.toContain(
      squashHtml('Mutators here'),
    )
  })
})
