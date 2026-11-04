import { describe, expect, it } from '@rstest/core'

import { applyDiscount, isFree } from '../src/price.js'

describe('applyDiscount', () => {
  it('takes a percent off', () => {
    expect(applyDiscount(200, 25)).toBe(150)
  })

  it('rejects more than 100 percent', () => {
    expect(() => applyDiscount(10, 101)).toThrow(RangeError)
  })
})

describe('isFree', () => {
  it('is true for zero', () => {
    expect(isFree(0)).toBe(true)
  })
})
