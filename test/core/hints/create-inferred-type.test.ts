import { describe, expect, it } from 'vitest'

import type { ValueKind } from '../../../types/value-kind'

import { createInferredType } from '../../../core/hints/create-inferred-type'

describe('createInferredType', () => {
  it.each<[readonly ValueKind[] | null, readonly ValueKind[] | null]>([
    [null, null],
    [[], null],
    [['string'], ['string']],
    [
      ['undefined', 'string', 'array', 'null'],
      ['array', 'null', 'string', 'undefined'],
    ],
    [
      ['number', 'null', 'number', 'null'],
      ['null', 'number'],
    ],
  ])('normalizes %j to %j', (kinds, expected) => {
    expect(createInferredType(kinds)).toStrictEqual({ kinds: expected })
  })
})
