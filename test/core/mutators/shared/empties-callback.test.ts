import { describe, expect, it } from 'vitest'

import type { CallbackOwner } from '../../../../core/mutators/shared/get-callback-owner'

import { emptiesCallback } from '../../../../core/mutators/shared/empties-callback'

describe('emptiesCallback', () => {
  it.each<[CallbackOwner, unknown, boolean]>([
    ['toSorted', 0, false],
    ['toSorted', false, false],
    ['toSorted', 1, false],
    ['sort', 0, true],
    ['sort', false, true],
    ['sort', '', true],
    ['sort', [], true],
    ['sort', undefined, true],
    ['sort', 0n, true],
    ['sort', 'a', true],
    ['sort', 1, false],
    ['sort', -1, false],
    ['sort', true, false],
  ])('answers %s with %s', (owner, value, expected) => {
    expect(emptiesCallback(owner, value)).toBe(expected)
  })
})
