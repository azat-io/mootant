import { describe, expect, it } from 'vitest'

import type { ValueKind } from '../../../../types/value-kind'

import { createInferredType } from '../../../../core/hints/create-inferred-type'
import { mayBeBoolean } from '../../../../core/mutators/shared/may-be-boolean'

describe('mayBeBoolean', () => {
  it.each<[ValueKind[] | null, boolean]>([
    [['boolean'], true],
    [['boolean', 'undefined'], true],
    [null, true],
    [['boolean', 'string'], true],
    [['string'], false],
    [['object'], false],
  ])('answers %j with %s', (kinds, expected) => {
    expect(mayBeBoolean(createInferredType(kinds))).toBe(expected)
  })
})
