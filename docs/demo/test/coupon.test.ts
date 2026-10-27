import { describe, expect, it } from 'vitest'

import { applyCoupon, parseCoupon } from '../src/coupon'

describe('parseCoupon', () => {
  it('reads the code and the percent', () => {
    expect(parseCoupon('save-10')).toEqual({ code: 'SAVE', percent: 10 })
  })

  it('rejects a code without a percent', () => {
    expect(parseCoupon('SAVE')).toBeNull()
  })

  it('rejects more than 50% off', () => {
    expect(parseCoupon('SAVE-60')).toBeNull()
  })
})

describe('applyCoupon', () => {
  it('takes the percent off', () => {
    expect(applyCoupon(80, { code: 'SAVE', percent: 10 })).toBe(72)
  })

  it('keeps the total without a coupon', () => {
    expect(applyCoupon(80, null)).toBe(80)
  })
})
