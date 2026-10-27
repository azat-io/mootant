import { describe, expect, it } from 'vitest'

import { renderMutatorsView } from '../../../../cli/html/client/render-mutators-view'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderMutatorsView', () => {
  it('lists mutators from the lowest score with their skips', () => {
    let report = createHtmlReport()
    report.mutators.push({ description: 'Idle.', id: 'idle', mutants: 0 })
    let html = renderMutatorsView(indexReport(report))
    let order = [...html.matchAll(/<tr data-mutator="(?<id>[\w-]+)"/gu)].map(
      match => match.groups!['id'],
    )

    expect(order).toStrictEqual([
      'comparison-operator',
      'arithmetic-operator',
      'number-literal',
      'string-literal',
      'conditional',
    ])
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<th scope="row" class="text-cell"><a class="name" href="#/mutants" data-mutator="comparison-operator"><code>comparison-operator</code></a><span class="description">Changes a comparison operator.</span></th>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<td class="dim">1</td></tr>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<p class="table-note">No mutants in this run: <b>idle</b>.</p>',
      ),
    )
    expect(squashHtml(html)).toContain(squashHtml('5 mutators · 6 mutants'))
  })

  it('puts mutators without a score last', () => {
    let report = createHtmlReport()
    report.mutators.push({ description: 'Errs.', id: 'errs', mutants: 1 })
    report.mutants.push({ ...report.mutants[3]!, mutator: 5, id: 'errs' })
    let html = renderMutatorsView(indexReport(report))

    expect(html.indexOf('data-mutator="string-literal"')).toBeLessThan(
      html.indexOf('data-mutator="conditional"'),
    )
    expect(html.indexOf('data-mutator="number-literal"')).toBeLessThan(
      html.indexOf('data-mutator="errs"'),
    )
  })

  it('leaves the note out when every mutator has mutants', () => {
    expect(
      squashHtml(renderMutatorsView(indexReport(createHtmlReport()))),
    ).not.toContain(squashHtml('No mutants in this run'))
  })
})
