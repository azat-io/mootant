import { describe, expect, it } from 'vitest'

import { renderSkipPanel } from '../../../../cli/html/client/render-skip-panel'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderSkipPanel', () => {
  it('explains the skip with the mutant that justifies it and the mutants there', () => {
    let index = indexReport(createHtmlReport())
    let [file] = index.files
    let html = renderSkipPanel(index, file!, file!.skipped[0]!)

    expect(squashHtml(html)).toContain(
      squashHtml('<span class="status status-skipped">equivalent</span>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<span class="where">line 4:10</span>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<dt>rule</dt><dd><code>lower-bound</code> · a guess, not a proof</dd>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<dt>why</dt><dd>A lower bound of an operand makes the inputs where it differs impossible.</dd>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<dt>covered by</dt><dd><a href="#/mutant/survived0001"><code>comparison-operator</code> at 4:10</a> · survived</dd>',
      ),
    )
    expect(squashHtml(html)).toContain(squashHtml('Mutants that run here'))
    expect(html.match(/class="also-link"/gu)).toHaveLength(2)
  })

  it('shows a skip justified by a mutator that is turned off, without a guess or mutants there', () => {
    let report = createHtmlReport()
    let [skip] = report.skipped
    report.skipped = [
      { ...skip!, by: { ...skip!.by!, mutator: 'logical-operator', id: null } },
      { ...skip!, heuristic: undefined, by: undefined, start: 0, end: 6 },
    ]
    delete report.skipped[1]!.heuristic
    delete report.skipped[1]!.by
    let index = indexReport(report)
    let [file] = index.files

    expect(
      squashHtml(renderSkipPanel(index, file!, file!.skipped[0]!)),
    ).toContain(
      squashHtml(
        '<dt>covered by</dt><dd><code>logical-operator</code> at 4:10</dd>',
      ),
    )
    let alone = renderSkipPanel(index, file!, file!.skipped[1]!)

    expect(squashHtml(alone)).not.toContain(squashHtml('covered by'))
    expect(squashHtml(alone)).not.toContain(squashHtml('a guess'))
    expect(squashHtml(alone)).not.toContain(squashHtml('Mutants that run here'))
  })
})
