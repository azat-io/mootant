import { describe, expect, it } from 'vitest'

import { isComparatorResult } from '../../../../core/mutators/shared/is-comparator-result'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isComparatorResult', () => {
  it.each<[string, string, boolean]>([
    ['x = rows.sort((a, b) => -1)', '-1', true],
    ['x = rows.sort((a, b) => a.n > b.n ? 1 : -1)', '-1', true],
    ['x = rows.toSorted((a, b) => { return -1 })', '-1', true],
    ['x = rows.sort((a, b) => (a.n > b.n ? -1 : 1) || 0)', '-1', false],
    ['x = rows.map(row => -1)', '-1', false],
    ['function f() { return -1 }', '-1', false],
    ['x = -1', '-1', false],
  ])('answers %s for %s with %s', (source, text, expected) => {
    let { context, find } = createTestContext(source)

    expect(isComparatorResult(find('UnaryExpression', text), context)).toBe(
      expected,
    )
  })
})
