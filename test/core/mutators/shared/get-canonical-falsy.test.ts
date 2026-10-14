import { describe, expect, it } from 'vitest'

import type { TypeView } from '../../../../core/mutators/shared/get-type-view'

import { getCanonicalFalsy } from '../../../../core/mutators/shared/get-canonical-falsy'

describe('getCanonicalFalsy', () => {
  it.each<[TypeView['type'], unknown]>([
    ['string', ''],
    ['number', 0],
    ['bigint', 0n],
    ['boolean', false],
    ['object', null],
    ['unknown', null],
  ])('gives the falsy value of %s', (type, expected) => {
    expect(getCanonicalFalsy(type)).toBe(expected)
  })
})
