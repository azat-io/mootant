import { describe, expect, it } from 'vitest'

import { getDiscount } from '../src/discount'

describe('getDiscount', () => {
  it('gives members 10% off', () => {
    expect(getDiscount(50, true)).toBe(5)
  })

  it('gives large orders 10% off', () => {
    expect(getDiscount(250, false)).toBe(25)
  })

  it('keeps the full price of small orders', () => {
    expect(getDiscount(99, false)).toBe(0)
  })
})
