import { describe, expect, it } from 'vitest'

import { isGlobalIdentifier } from '../../../../core/mutators/shared/is-global-identifier'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isGlobalIdentifier', () => {
  it.each<[string, string, boolean]>([
    ['x = undefined', 'undefined', true],
    ['x = NaN', 'NaN', true],
    ['let undefined = 1; x = undefined', 'undefined', false],
    ['x = NaN', 'undefined', false],
    ['x = this', 'undefined', false],
    ['x = (undefined)', 'undefined', false],
  ])('answers %s for %s with %s', (source, name, expected) => {
    let { context, find } = createTestContext(source)
    let value = find('AssignmentExpression').right

    expect(isGlobalIdentifier(value, name, context)).toBe(expected)
  })
})
