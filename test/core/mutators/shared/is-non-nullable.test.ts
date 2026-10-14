import { describe, expect, it } from 'vitest'

import type { ValueKind } from '../../../../types/value-kind'

import { createInferredType } from '../../../../core/hints/create-inferred-type'
import { isNonNullable } from '../../../../core/mutators/shared/is-non-nullable'

describe('isNonNullable', () => {
  it.each<[ValueKind[] | null, boolean]>([
    [['object'], true],
    [['number', 'string'], true],
    [['null'], false],
    [['object', 'undefined'], false],
    [null, false],
  ])('answers %j with %s', (kinds, expected) => {
    expect(isNonNullable(createInferredType(kinds))).toBe(expected)
  })
})
