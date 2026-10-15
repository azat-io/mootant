import { describe, expect, it } from 'vitest'

import type { ValueKind } from '../../../../types/hints/value-kind'

import { createInferredType } from '../../../../core/hints/create-inferred-type'
import { mayBeNullish } from '../../../../core/mutators/shared/may-be-nullish'

describe('mayBeNullish', () => {
  it.each<[ValueKind[] | null, boolean]>([
    [null, true],
    [['undefined'], true],
    [['string', 'null'], true],
    [['string'], false],
    [['array', 'bigint', 'boolean', 'function', 'number'], false],
  ])('answers %j with %s', (kinds, expected) => {
    expect(mayBeNullish(createInferredType(kinds))).toBe(expected)
  })
})
