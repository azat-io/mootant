import { describe, expect, it } from 'vitest'

import type { InferredType } from '../../../types/hints/inferred-type'

import { removeNullish } from '../../../core/hints/remove-nullish'

describe('removeNullish', () => {
  it.each<[InferredType, InferredType]>([
    [{ kinds: ['null', 'string', 'undefined'] }, { kinds: ['string'] }],
    [{ kinds: ['array', 'number'] }, { kinds: ['array', 'number'] }],
    [{ kinds: ['null', 'undefined'] }, { kinds: null }],
    [{ kinds: null }, { kinds: null }],
    [{ knownKinds: ['null', 'string'], kinds: null }, { kinds: null }],
  ])('removes null and undefined from %j', (type, expected) => {
    expect(removeNullish(type)).toStrictEqual(expected)
  })
})
