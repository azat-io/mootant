import { describe, expect, it } from 'vitest'

import { renderTestsView } from '../../../../cli/html/client/render-tests-view'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderTestsView', () => {
  let index = indexReport(createHtmlReport())

  /**
   * Lists the names of the tests a page shows.
   *
   * @param html - HTML of the page.
   * @returns Own names of the tests, in order.
   */
  function names(html: string): string[] {
    return [...html.matchAll(/<b>(?<name>[^<]+)<\/b>/gu)].map(
      match => match.groups!['name']!,
    )
  }

  it('lists tests by survivors and mutants reached, with the groups', () => {
    let html = renderTestsView(index, {
      target: null,
      group: 'all',
      limit: 300,
    })

    expect(names(html)).toStrictEqual(['small sizes', 'unit', 'unused'])
    expect(squashHtml(html)).toContain(
      squashHtml('<tr id="test-1"><th scope="row" class="text-cell">'),
    )
    expect(squashHtml(html)).not.toContain(squashHtml('data-tests-more'))
    expect(squashHtml(html)).toContain(
      squashHtml(
        'data-tests-filter="survivors" aria-pressed="false">Reach survivors <span class="count">2</span>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<td class="left dim path-cell">test/cart.test.ts:12</td><td class="dim">8 ms</td><td>2</td><td><span class="zero">–</span></td><td><span class="verdict hot">1</span></td>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml('<td class="left dim path-cell">test/other.test.ts</td>'),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<colgroup><col><col style="inline-size: calc(20ch + 2 * var(--space-s))">',
      ),
    )
  })

  it.each([
    ['survivors', ['small sizes', 'unit']],
    ['none', ['unused']],
    ['slowest', ['small sizes', 'unit', 'unused']],
  ] as const)('shows the group %s', (filter, expected) => {
    expect(
      names(
        renderTestsView(index, { group: filter, target: null, limit: 300 }),
      ),
    ).toStrictEqual(expected)
  })

  it('tells about an empty group, offers more rows and marks the test the search opened', () => {
    let report = createHtmlReport()
    report.tests = Array.from({ length: 5 }, (_, position) => ({
      ...report.tests[0]!,
      name: `test ${position}`,
      reach: 5 - position,
    }))
    let long = indexReport(report)

    expect(
      squashHtml(
        renderTestsView(long, { group: 'none', target: null, limit: 2 }),
      ),
    ).toContain(squashHtml('<p class="empty">No test in this group.</p>'))
    let paged = renderTestsView(long, { target: null, group: 'all', limit: 2 })

    expect(names(paged)).toStrictEqual(['test 0', 'test 1'])
    expect(squashHtml(paged)).toContain(
      squashHtml(
        '<button class="text-button" type="button" data-tests-more>Show more · 3 left</button>',
      ),
    )
    let marked = renderTestsView(long, { group: 'all', target: 3, limit: 4 })

    expect(names(marked)).toStrictEqual([
      'test 0',
      'test 1',
      'test 2',
      'test 3',
    ])
    expect(squashHtml(marked)).toContain(
      squashHtml('<tr id="test-3" class="is-target">'),
    )
    expect(squashHtml(marked)).toContain(squashHtml('Show more · 1 left'))
  })
})
