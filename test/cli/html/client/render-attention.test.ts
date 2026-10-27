import { describe, expect, it } from 'vitest'

import { renderAttention } from '../../../../cli/html/client/render-attention'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderAttention', () => {
  it('groups the mutants to act on by file with the counts and score', () => {
    let html = renderAttention(indexReport(createHtmlReport()), 'all')

    expect(squashHtml(html)).toContain(
      squashHtml(
        '<div class="group-head"><span class="path">src/cart.ts</span><span class="aside">1 of 6 survived, 1 without coverage, 1 error · score 50.00%</span><a class="open" href="#/mutant/survived0001">Open file ›</a></div>',
      ),
    )
    expect(html.match(/class="row"/gu)).toHaveLength(3)
  })

  it('leaves survivors out of the head of a file without them', () => {
    let report = createHtmlReport()
    report.mutants = report.mutants.filter(
      mutant => mutant.status === 'NoCoverage',
    )

    expect(squashHtml(renderAttention(indexReport(report), 'all'))).toContain(
      squashHtml('<span class="aside">1 without coverage · score 0.00%</span>'),
    )
  })

  it('shows one status', () => {
    let html = renderAttention(indexReport(createHtmlReport()), 'NoCoverage')

    expect(html.match(/class="row"/gu)).toHaveLength(1)
    expect(squashHtml(html)).toContain(
      squashHtml('href="#/mutant/uncovered001"'),
    )
  })

  it('points to the rest of a long file and to the files left out', () => {
    let report = createHtmlReport()
    let survivor = report.mutants[2]!
    report.files = Array.from({ length: 8 }, (_, file) => ({
      source: 'let a = b < c\n',
      file: `src/f${file}.ts`,
      parsed: true,
    }))
    report.mutants = report.files.flatMap((_, file) =>
      Array.from({ length: 7 }, (__, position) => ({
        ...survivor,
        id: `f${file}m${position}`,
        start: 8,
        end: 13,
        file,
      })),
    )
    report.skipped = []
    report.summary.staticCost = []
    let html = renderAttention(indexReport(report), 'all')

    expect(html.match(/class="group"/gu)).toHaveLength(6)
    expect(html.match(/class="row"/gu)).toHaveLength(36)
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<a class="more-row" href="#/mutant/f0m6">1 more in this file ›</a>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<a class="more-row group-more" href="#/mutants">14 more mutants in 2 more files ›</a>',
      ),
    )
  })
})
