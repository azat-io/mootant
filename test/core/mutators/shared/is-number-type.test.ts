import { describe, expect, it } from 'vitest'

import type { ValueKind } from '../../../../types/value-kind'

import { createInferredType } from '../../../../core/hints/create-inferred-type'
import { isNumberType } from '../../../../core/mutators/shared/is-number-type'

describe('isNumberType', () => {
  it.each<[ValueKind[] | null, boolean]>([
    [['number'], true],
    [['bigint', 'number'], true],
    [['number', 'undefined'], true],
    [['bigint', 'null'], true],
    [['null', 'undefined'], false],
    [['number', 'string'], false],
    [['string'], false],
    [null, false],
  ])('answers %j with %s', (kinds, expected) => {
    expect(isNumberType(createInferredType(kinds))).toBe(expected)
  })
})
