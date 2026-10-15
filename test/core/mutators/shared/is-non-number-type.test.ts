import { describe, expect, it } from 'vitest'

import type { ValueKind } from '../../../../types/hints/value-kind'

import { isNonNumberType } from '../../../../core/mutators/shared/is-non-number-type'
import { createInferredType } from '../../../../core/hints/create-inferred-type'

describe('isNonNumberType', () => {
  it.each<[ValueKind[] | null, boolean]>([
    [['string'], true],
    [['null', 'undefined'], true],
    [['array', 'object'], true],
    [['number'], false],
    [['bigint', 'string'], false],
    [null, false],
  ])('answers %j with %s', (kinds, expected) => {
    expect(isNonNumberType(createInferredType(kinds))).toBe(expected)
  })
})
