import { describe, expect, it } from 'vitest'

import { renderMutantRow } from '../../../../cli/html/client/render-mutant-row'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderMutantRow', () => {
  let report = createHtmlReport()
  report.mutants.push({ ...report.mutants[3]!, id: 'errored00002' })
  delete report.mutants.at(-1)!.message
  report.mutants.push({
    ...report.mutants[2]!,
    id: 'survived0002',
    testFiles: [],
  })
  let index = indexReport(report)

  it('opens the mutant and hints at the test file to extend', () => {
    expect(squashHtml(renderMutantRow(index, index.mutants[2]!))).toBe(
      squashHtml(
        '<a class="row" href="#/mutant/survived0001"><span class="dot status-survived" role="img" aria-label="survived"></span><span class="where">4:10</span><span class="chip">comparison-operator</span><span class="change"><span class="before">size &lt; limit</span><span class="arrow" aria-label="becomes">→</span><span class="after">size &lt;= limit</span></span><span class="hint" title="test/cart.test.ts"><bdi>test/cart.test.ts</bdi></span><span class="id">surv</span></a>',
      ),
    )
  })

  it.each([
    [3, 'Tries of test/cart.test.ts went missing twice.'],
    [4, 'no test reaches line 6'],
    [6, ''],
    [7, ''],
  ])('hints for mutant %i', (position, hint) => {
    expect(
      squashHtml(renderMutantRow(index, index.mutants[position]!)),
    ).toContain(squashHtml(`<bdi>${hint}</bdi>`))
  })
})
