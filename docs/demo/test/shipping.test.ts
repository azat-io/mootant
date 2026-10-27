import { describe, expect, it } from 'vitest'

import { countParcels, getShipping } from '../src/shipping'

describe('getShipping', () => {
  it('ships light parcels in the US for 5', () => {
    expect(getShipping(2, 'US')).toBe(5)
  })

  it('ships heavy parcels for three times the rate', () => {
    expect(getShipping(6, 'US')).toBe(15)
  })

  it('ships to other countries for 25', () => {
    expect(getShipping(1, 'DE')).toBe(25)
  })
})

describe('countParcels', () => {
  it('packs up to 20 in a parcel', () => {
    expect(countParcels(45)).toBe(3)
  })
})
