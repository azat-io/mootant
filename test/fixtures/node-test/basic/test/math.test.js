import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isPositive, sign, add } from '../src/math.js'

test('adds', () => {
  assert.equal(add(2, 3), 5)
})

test('tells positive numbers', () => {
  assert.equal(isPositive(1), true)
  assert.equal(isPositive(-1), false)
})

test('gives the sign', () => {
  assert.equal(sign(5), 1)
  assert.equal(sign(-5), -1)
})
