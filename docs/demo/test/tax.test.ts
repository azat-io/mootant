import { describe, expect, it } from 'vitest'

import { getTax } from '../src/tax'

describe('getTax', () => {
  it('adds German VAT', () => {
    expect(getTax(100, 'DE')).toBe(19)
  })

  it('adds no tax in the US', () => {
    expect(getTax(100, 'US')).toBe(0)
  })

  it('rejects a country without a rate', () => {
    expect(() => getTax(100, 'JP')).toThrow(RangeError)
  })
})
