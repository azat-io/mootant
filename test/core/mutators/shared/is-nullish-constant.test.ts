import { describe, expect, it } from 'vitest'

import { isNullishConstant } from '../../../../core/mutators/shared/is-nullish-constant'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isNullishConstant', () => {
  it.each<[string, boolean]>([
    ['x = null', true],
    ['x = (null)', true],
    ['x = undefined', true],
    ['x = void 0', true],
    ['let undefined = 1; x = undefined', false],
    ['x = !0', false],
    ['x = 0', false],
    ['x = /a/u', false],
    ['x = y', false],
  ])('answers %s with %s', (source, expected) => {
    let { context, find } = createTestContext(source)
    let value = find('AssignmentExpression').right

    expect(isNullishConstant(value, context)).toBe(expected)
  })
})
