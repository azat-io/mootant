import { describe, expect, it } from 'vitest'

import { findSearchResults } from '../../../../cli/html/client/find-search-results'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { indexReport } from '../../../../cli/html/client/index-report'

describe('findSearchResults', () => {
  let index = indexReport(createHtmlReport())

  it('lists the mutants to act on without a text', () => {
    expect(
      findSearchResults(index, ' ').map(result => result.href),
    ).toStrictEqual([
      '#/mutant/survived0001',
      '#/mutant/errored00001',
      '#/mutant/uncovered001',
    ])
  })

  it('finds files, mutants and tests, the mutants to act on first', () => {
    expect(
      findSearchResults(index, 'CART').map(result => result.href),
    ).toStrictEqual([
      '#/file/src/cart.ts',
      '#/mutant/survived0001',
      '#/mutant/uncovered001',
      '#/mutant/errored00001',
      '#/mutant/timeout00001',
      '#/mutant/killed000001',
      '#/mutant/ignored00001',
      '#/tests/1',
    ])
    expect(findSearchResults(index, 'size <')[0]).toStrictEqual({
      text: 'src/cart.ts:4  comparison-operator  size < limit → size <= limit',
      href: '#/mutant/survived0001',
      kind: 'survived',
    })
    expect(findSearchResults(index, '4 + 1')).toStrictEqual([
      {
        text: 'src/cart.ts:8  arithmetic-operator  4 - 1 → 4 + 1',
        href: '#/mutant/ignored00001',
        kind: 'ignored',
      },
    ])
  })

  it('shows a removal and stops at 30 results', () => {
    let report = createHtmlReport()
    report.mutants = Array.from({ length: 40 }, (_, position) => ({
      ...report.mutants[0]!,
      id: `id${position}`,
      replacement: '',
    }))

    let found = findSearchResults(indexReport(report), 'id')

    expect(found).toHaveLength(30)
    expect(found[0]!.text).toBe("src/cart.ts:1  string-literal  'cm' → removed")
  })
})
