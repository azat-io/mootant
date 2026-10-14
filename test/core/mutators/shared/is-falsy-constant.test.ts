import { describe, expect, it } from 'vitest'

import { isFalsyConstant } from '../../../../core/mutators/shared/is-falsy-constant'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isFalsyConstant', () => {
  it.each<[string, boolean]>([
    ['x = false', true],
    ['x = 0', true],
    ['x = -0', true],
    ['x = 0n', true],
    ["x = ''", true],
    ['x = ``', true],
    ['x = null', true],
    ['x = undefined', true],
    ['x = void f()', true],
    ['x = NaN', true],
    ['x = (NaN)', true],
    ['let NaN = 1; x = NaN', false],
    ['x = 1', false],
    ["x = 'a'", false],
    ['x = y', false],
  ])('answers %s with %s', (source, expected) => {
    let { context, find } = createTestContext(source)
    let value = find('AssignmentExpression').right

    expect(isFalsyConstant(value, context)).toBe(expected)
  })
})
