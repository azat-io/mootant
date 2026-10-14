import { describe, expect, it } from 'vitest'

import { getProvenComparisonValue } from '../../../../core/mutators/shared/get-proven-comparison-value'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getProvenComparisonValue', () => {
  it.each<[string, boolean | null]>([
    ["let v: string = f(); x = typeof v === 'string'", true],
    ["let v: string = f(); x = 'number' == (typeof v)", false],
    ["let v: string = f(); x = typeof v !== 'string'", false],
    ["let v: number[] = f(); x = typeof v != 'object'", false],
    ["let v: string | undefined = f(); x = typeof v === 'string'", null],
    ["x = typeof v === 'string'", null],
    ['let v: string = f(); x = typeof v === other', null],
    ["let v: string = f(); x = -v === 'string'", null],
    ['interface User {} let u: User = f(); x = u === null', false],
    ['interface User {} let u: User = f(); x = undefined != u', true],
    ['interface User {} let u: User = f(); x = u !== void 0', true],
    ['interface User {} let u: User | null = f(); x = u === null', null],
    ['let u: User = f(); x = u === null', null],
    ['x = u === null', null],
    ['x = null === null', null],
    ['interface User {} let u: User = f(); x = u === other', null],
    ['interface User {} let u: User = f(); x = u < null', null],
  ])('decides %s', (source, expected) => {
    let { context, find } = createTestContext(source)

    expect(
      getProvenComparisonValue(find('BinaryExpression', undefined, 0), context),
    ).toBe(expected)
  })
})
