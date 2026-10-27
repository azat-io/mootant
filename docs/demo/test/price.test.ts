import { describe, expect, it } from 'vitest'

import { formatPrice } from '../src/price'

describe('formatPrice', () => {
  it('shows dollars with cents', () => {
    expect(formatPrice(12.5)).toBe('$12.50')
  })

  it('puts the sign before the symbol', () => {
    expect(formatPrice(-3, 'EUR')).toBe('-€3.00')
  })

  it('rejects an unknown currency', () => {
    expect(() => formatPrice(1, 'XYZ')).toThrow(RangeError)
  })
})
