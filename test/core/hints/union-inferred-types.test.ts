import { describe, expect, it } from 'vitest'

import type { InferredType } from '../../../types/hints/inferred-type'

import { unionInferredTypes } from '../../../core/hints/union-inferred-types'

describe('unionInferredTypes', () => {
  it.each<[InferredType[], InferredType]>([
    [[], { kinds: null }],
    [[{ kinds: ['string'] }], { kinds: ['string'] }],
    [
      [{ kinds: ['string', 'undefined'] }, { kinds: ['null', 'string'] }],
      { kinds: ['null', 'string', 'undefined'] },
    ],
    [
      [{ kinds: ['number'] }, { kinds: null }],
      { knownKinds: ['number'], kinds: null },
    ],
    [
      [{ kinds: null }, { kinds: ['null', 'number'] }],
      { knownKinds: ['null', 'number'], kinds: null },
    ],
    [
      [{ knownKinds: ['null'], kinds: null }, { kinds: ['string'] }],
      { knownKinds: ['null', 'string'], kinds: null },
    ],
    [[{ kinds: null }, { kinds: null }], { kinds: null }],
  ])('joins %j', (types, expected) => {
    expect(unionInferredTypes(types)).toStrictEqual(expected)
  })
})
