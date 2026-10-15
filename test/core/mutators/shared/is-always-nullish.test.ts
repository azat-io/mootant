import { describe, expect, it } from 'vitest'

import type { ValueKind } from '../../../../types/hints/value-kind'

import { isAlwaysNullish } from '../../../../core/mutators/shared/is-always-nullish'
import { createInferredType } from '../../../../core/hints/create-inferred-type'

describe('isAlwaysNullish', () => {
  it.each<[ValueKind[] | null, boolean]>([
    [['null'], true],
    [['null', 'undefined'], true],
    [['string', 'undefined'], false],
    [null, false],
  ])('answers %j with %s', (kinds, expected) => {
    expect(isAlwaysNullish(createInferredType(kinds))).toBe(expected)
  })
})
