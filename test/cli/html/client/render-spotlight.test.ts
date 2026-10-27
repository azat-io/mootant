import { describe, expect, it } from 'vitest'

import { renderSpotlight } from '../../../../cli/html/client/render-spotlight'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderSpotlight', () => {
  it('lists the weakest mutators and the files with the most isolated time', () => {
    let report = createHtmlReport()
    report.summary.staticCost = [
      { file: 'src/cached.ts', duration: 0, mutants: 1, units: 1 },
      { file: 'src/a.ts', duration: 100, mutants: 1, units: 1 },
      { file: 'src/cart.ts', duration: 300, mutants: 2, units: 2 },
    ]
    let markup = squashHtml(renderSpotlight(indexReport(report)))

    expect(markup).toContain(
      squashHtml(
        '<li class="spotlight-entry"><a class="spotlight-name" href="#/mutants" data-mutator="comparison-operator">comparison-operator</a><span class="spotlight-value">0.00%</span><div class="status-bar small"',
      ),
    )
    expect(markup.indexOf('comparison-operator')).toBeLessThan(
      markup.indexOf('arithmetic-operator'),
    )
    expect(markup).not.toContain('string-literal')
    expect(markup).toContain(
      squashHtml(
        '<a class="spotlight-name" href="#/file/src/cart.ts">src/cart.ts</a><span class="spotlight-value">75%</span><span class="share" role="img" aria-label="75% of the isolated test time, 300 ms"><span style="inline-size: 75%"></span></span>',
      ),
    )
    expect(markup.indexOf('src/cart.ts')).toBeLessThan(
      markup.indexOf('src/a.ts'),
    )
    expect(markup).toContain('Isolated test time')
    expect(markup).not.toContain('src/cached.ts')
  })

  it('renders nothing when every mutator is detected and nothing ran isolated', () => {
    let report = createHtmlReport()
    report.mutants = report.mutants.filter(mutant => mutant.status === 'Killed')
    report.summary.staticCost = []

    expect(renderSpotlight(indexReport(report))).toBe('')
  })
})
