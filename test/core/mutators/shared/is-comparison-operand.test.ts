import { describe, expect, it } from 'vitest'

import { isComparisonOperand } from '../../../../core/mutators/shared/is-comparison-operand'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isComparisonOperand', () => {
  it.each<[string, boolean]>([
    ['x = a === 1', true],
    ['x = 1 < (a as number)', true],
    ['x = !a == b', true],
    ['x = a in b', true],
    ['x = a + 1', false],
    ['x = f(a) === 1', false],
    ['x = a', false],
  ])('answers a in %s', (source, expected) => {
    let { context, find } = createTestContext(source)

    expect(isComparisonOperand(find('Identifier', 'a'), context)).toBe(expected)
  })
})
