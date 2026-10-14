import { describe, expect, it } from 'vitest'

import type { ValueKind } from '../../../../types/value-kind'

import { createInferredType } from '../../../../core/hints/create-inferred-type'
import { isNumericPair } from '../../../../core/mutators/shared/is-numeric-pair'

describe('isNumericPair', () => {
  it.each<[ValueKind[] | null, ValueKind[] | null, boolean]>([
    [['number'], ['number'], true],
    [['number'], null, true],
    [null, ['bigint'], true],
    [['number', 'undefined'], ['number'], true],
    [null, null, false],
    [['number'], ['string'], false],
    [['string'], ['number'], false],
    [['null'], ['number'], false],
  ])('answers %j and %j with %s', (left, right, expected) => {
    expect(
      isNumericPair(createInferredType(left), createInferredType(right)),
    ).toBe(expected)
  })
})
