import { describe, expect, it } from 'vitest'

import { getSubtotal, getWeight, getTotal } from '../src/cart'

let book = { name: 'Book', quantity: 2, weight: 1, price: 20 }
let lamp = { name: 'Lamp', quantity: 1, weight: 4, price: 80 }

describe('getSubtotal', () => {
  it('sums prices by quantity', () => {
    expect(getSubtotal([book, lamp])).toBe(120)
  })
})

describe('getWeight', () => {
  it('sums weights by quantity', () => {
    expect(getWeight([book, lamp])).toBe(6)
  })
})

describe('getTotal', () => {
  it('costs nothing when the cart is empty', () => {
    expect(getTotal([], { country: 'US', isMember: true, coupon: null })).toBe(
      0,
    )
  })

  it('adds shipping and takes off the discount', () => {
    expect(
      getTotal([book, lamp], { country: 'US', isMember: false, coupon: null }),
    ).toBe(123)
  })

  it('takes the coupon off after the discount', () => {
    let coupon = { code: 'SAVE', percent: 10 }
    expect(getTotal([lamp], { country: 'US', isMember: false, coupon })).toBe(
      77,
    )
  })

  it('adds the tax of the country', () => {
    expect(
      getTotal([book], { country: 'DE', isMember: true, coupon: null }),
    ).toBeCloseTo(67.84)
  })
})
