import { describe, expect, it } from 'vitest'

import type { ValueKind } from '../../../../types/hints/value-kind'

import { hasDefinedFalsyValue } from '../../../../core/mutators/shared/has-defined-falsy-value'
import { createInferredType } from '../../../../core/hints/create-inferred-type'

describe('hasDefinedFalsyValue', () => {
  it.each<[ValueKind[] | null, boolean]>([
    [['string'], true],
    [['number', 'undefined'], true],
    [['bigint'], true],
    [['boolean'], true],
    [['object'], false],
    [['number', 'string'], false],
    [null, false],
  ])('answers %j with %s', (kinds, expected) => {
    expect(hasDefinedFalsyValue(createInferredType(kinds))).toBe(expected)
  })
})
