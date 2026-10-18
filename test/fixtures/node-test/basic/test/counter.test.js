import assert from 'node:assert/strict'
import { test } from 'node:test'

import { increment, current } from '../src/counter.js'

test('increments', () => {
  increment()
})

// Never reaches `increment`, but sees the count the first test left.
test('keeps the count', () => {
  assert.equal(current(), 1)
})
