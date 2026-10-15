import { describe, expect, it } from 'vitest'

import type { ValueKind } from '../../../../types/hints/value-kind'

import { createInferredType } from '../../../../core/hints/create-inferred-type'
import { getTypeofName } from '../../../../core/mutators/shared/get-typeof-name'

describe('getTypeofName', () => {
  it.each<[ValueKind[] | null, string | null]>([
    [['string'], 'string'],
    [['array', 'object', 'promise'], 'object'],
    [['function'], 'function'],
    [['symbol'], 'symbol'],
    [['bigint'], 'bigint'],
    [['function', 'object'], null],
    [['string', 'undefined'], null],
    [['null'], null],
    [null, null],
  ])('reads %j as %s', (kinds, expected) => {
    expect(getTypeofName(createInferredType(kinds))).toBe(expected)
  })
})
