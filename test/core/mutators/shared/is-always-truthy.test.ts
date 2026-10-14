import { describe, expect, it } from 'vitest'

import type { ValueKind } from '../../../../types/value-kind'

import { isAlwaysTruthy } from '../../../../core/mutators/shared/is-always-truthy'
import { createInferredType } from '../../../../core/hints/create-inferred-type'

describe('isAlwaysTruthy', () => {
  it.each<[ValueKind[] | null, boolean]>([
    [['object'], true],
    [['array'], true],
    [['function'], true],
    [['array', 'function', 'object', 'promise'], true],
    [['object', 'undefined'], false],
    [['string'], false],
    [['array', 'bigint', 'boolean', 'function', 'number'], false],
    [null, false],
  ])('answers %j with %s', (kinds, expected) => {
    expect(isAlwaysTruthy(createInferredType(kinds))).toBe(expected)
  })
})
