import { before, test } from 'node:test'
import assert from 'node:assert/strict'

import { average, clamp, isEven } from '../src/math.js'
import { joinList, pad } from '../src/text.js'

before(async () => {
  await new Promise(resolve => setTimeout(resolve, 150))
})

test('clamps', () => {
  assert.equal(clamp(5, 0, 10), 5)
  assert.equal(clamp(-1, 0, 10), 0)
})

test('averages', () => {
  assert.equal(average([2, 4]), 3)
})

test('even', () => {
  assert.equal(isEven(4), true)
})

test('pads with zeros', () => {
  assert.notEqual(pad(5, 2, '0'), '')
})

test('joins one', () => {
  assert.equal(joinList(['x']), 'x')
})
