import { describe, expect, it } from 'vitest'

import type { ValueKind } from '../../../../types/value-kind'

import { createInferredType } from '../../../../core/hints/create-inferred-type'
import { isStringType } from '../../../../core/mutators/shared/is-string-type'

describe('isStringType', () => {
  it.each<[ValueKind[] | null, boolean]>([
    [['string'], true],
    [['string', 'undefined'], true],
    [['number', 'string'], false],
    [null, false],
  ])('answers %j with %s', (kinds, expected) => {
    expect(isStringType(createInferredType(kinds))).toBe(expected)
  })
})
