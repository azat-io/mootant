import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { applyDiscount, isFree } from '../src/price.js'

describe('applyDiscount', () => {
  it('takes a percent off', () => {
    assert.equal(applyDiscount(200, 25), 150)
  })

  it('rejects more than 100 percent', () => {
    assert.throws(() => applyDiscount(10, 101), RangeError)
  })
})

describe('isFree', () => {
  it('is true for zero', () => {
    assert.equal(isFree(0), true)
  })
})
