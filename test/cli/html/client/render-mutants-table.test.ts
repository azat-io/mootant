import { describe, expect, it } from 'vitest'

import { renderMutantsTable } from '../../../../cli/html/client/render-mutants-table'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'
import { squashHtml } from '../../../helpers/squash-html'

describe('renderMutantsTable', () => {
  let index = indexReport(createHtmlReport())

  /**
   * Lists the ids of the rows of a table.
   *
   * @param html - HTML of the table.
   * @returns Ids of the mutants of the rows.
   */
  function ids(html: string): string[] {
    return [...html.matchAll(/<tr data-href="#\/mutant\/(?<id>\w+)"/gu)].map(
      match => match.groups!['id']!,
    )
  }

  it('lists every mutant with its place, status, mutator, change, tests and time', () => {
    let html = renderMutantsTable(index, {
      mutator: null,
      filter: 'all',
      limit: 200,
      query: '',
    })

    expect(ids(html)).toHaveLength(6)
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<table class="table fixed" style="min-inline-size: calc(88ch + 12 * var(--space-s) + 2 * var(--space-m))"><colgroup><col style="inline-size: calc(16ch + var(--space-s) + var(--space-m))"><col style="inline-size: calc(14ch + 2 * var(--space-s))"><col style="inline-size: calc(19ch + 2 * var(--space-s))"><col><col style="inline-size: calc(5ch + 2 * var(--space-s))"><col style="inline-size: calc(6ch + 2 * var(--space-s))"><col style="inline-size: calc(4ch + var(--space-s) + var(--space-m))"></colgroup>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<tr data-href="#/mutant/survived0001"><th scope="row" class="path-cell"><a href="#/mutant/survived0001">src/cart.ts<span class="dim">:4:10</span></a></th><td class="left"><span class="dot status-survived"></span> survived</td><td class="left dim">comparison-operator</td>',
      ),
    )
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<td>2</td><td class="dim">2 ms</td><td class="dim">surv</td>',
      ),
    )
  })

  it.each([
    [{ filter: 'Killed', query: '' }, ['killed000001']],
    [{ filter: 'all', query: 'TIME' }, ['timeout00001']],
    [{ query: 'arithmetic', filter: 'all' }, ['uncovered001', 'ignored00001']],
    [{ query: 'cart.ts:6', filter: 'all' }, ['uncovered001']],
    [{ filter: 'all', query: "'cm'" }, ['killed000001']],
    [{ query: '2 / 3', filter: 'all' }, ['uncovered001']],
    [
      { mutator: 'arithmetic-operator', filter: 'all', query: '' },
      ['uncovered001', 'ignored00001'],
    ],
    [{ mutator: 'arithmetic', filter: 'all', query: '' }, []],
  ] as const)('matches %j', (shown, expected) => {
    expect(
      ids(renderMutantsTable(index, { mutator: null, ...shown, limit: 200 })),
    ).toStrictEqual(expected)
  })

  it('offers more rows past the limit and tells when nothing matches', () => {
    let html = renderMutantsTable(index, {
      mutator: null,
      filter: 'all',
      query: '',
      limit: 4,
    })

    expect(ids(html)).toHaveLength(4)
    expect(squashHtml(html)).toContain(
      squashHtml(
        '<button class="text-button" type="button" data-more>Show more · 2 left</button>',
      ),
    )
    expect(
      squashHtml(
        renderMutantsTable(index, {
          query: 'nothing',
          mutator: null,
          filter: 'all',
          limit: 4,
        }),
      ),
    ).toBe(squashHtml('<p class="empty">No mutant matches.</p>'))
  })
})
