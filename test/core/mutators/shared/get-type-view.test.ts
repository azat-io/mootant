import { describe, expect, it } from 'vitest'

import type { ValueKind } from '../../../../types/value-kind'

import { createInferredType } from '../../../../core/hints/create-inferred-type'
import { getTypeView } from '../../../../core/mutators/shared/get-type-view'

describe('getTypeView', () => {
  it.each<[ValueKind[] | null, string, string]>([
    [null, 'unknown', 'unknown'],
    [['null'], 'nullish', 'nullable'],
    [['null', 'undefined'], 'nullish', 'nullable'],
    [['string'], 'string', 'non-nullable'],
    [['number', 'undefined'], 'number', 'nullable'],
    [['bigint'], 'bigint', 'non-nullable'],
    [['boolean', 'null'], 'boolean', 'nullable'],
    [['array'], 'array', 'non-nullable'],
    [['function'], 'function', 'non-nullable'],
    [['object'], 'object', 'non-nullable'],
    [['promise'], 'object', 'non-nullable'],
    [['array', 'object', 'undefined'], 'object', 'nullable'],
    [['array', 'function', 'object', 'promise'], 'object', 'non-nullable'],
    [['number', 'string'], 'unknown', 'non-nullable'],
    [['symbol'], 'unknown', 'non-nullable'],
    [['object', 'string', 'null'], 'unknown', 'nullable'],
    [
      [
        'array',
        'bigint',
        'boolean',
        'function',
        'number',
        'object',
        'promise',
        'string',
        'symbol',
      ],
      'unknown',
      'non-nullable',
    ],
  ])('reads %j as %s and %s', (kinds, type, nullability) => {
    expect(getTypeView(createInferredType(kinds))).toEqual({
      nullability,
      type,
    })
  })
})
