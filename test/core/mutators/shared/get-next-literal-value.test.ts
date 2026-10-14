import { describe, expect, it } from 'vitest'

import type { LiteralValue } from '../../../../core/mutators/shared/get-literal-value'

import { getNextLiteralValue } from '../../../../core/mutators/shared/get-next-literal-value'

describe('getNextLiteralValue', () => {
  it.each<[LiteralValue, LiteralValue]>([
    [true, false],
    [false, true],
    ['', 'mootant'],
    ['a', ''],
    [0, 1],
    [-1, 0],
    [0n, 1n],
  ])('changes %s to %s', (value, expected) => {
    expect(getNextLiteralValue(value)).toBe(expected)
  })
})
