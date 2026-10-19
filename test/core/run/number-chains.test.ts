import { describe, expect, it } from 'vitest'

import { numberChains } from '../../../core/run/number-chains'

describe('numberChains', () => {
  it('numbers keys from 0 in the order they first appear', () => {
    expect(numberChains(['b', 'a', 'b', 'c', 'a'])).toStrictEqual([
      0, 1, 0, 2, 1,
    ])
    expect(numberChains([])).toStrictEqual([])
  })
})
