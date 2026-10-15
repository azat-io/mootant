import { describe, expect, it } from 'vitest'

import type { InferredType } from '../../../types/hints/inferred-type'
import type { ValueKind } from '../../../types/hints/value-kind'

import { unionInferredTypes } from '../../../core/hints/union-inferred-types'

describe('unionInferredTypes', () => {
  it.each<[InferredType[], readonly ValueKind[] | null]>([
    [[], null],
    [[{ kinds: ['string'] }], ['string']],
    [
      [{ kinds: ['string', 'undefined'] }, { kinds: ['null', 'string'] }],
      ['null', 'string', 'undefined'],
    ],
    [[{ kinds: ['number'] }, { kinds: null }], null],
    [[{ kinds: null }, { kinds: ['number'] }], null],
  ])('joins %j', (types, expected) => {
    expect(unionInferredTypes(types)).toStrictEqual({ kinds: expected })
  })
})
