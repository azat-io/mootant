import assert from 'node:assert/strict'
import { test } from 'node:test'

import { increment, reset } from '../src/counter.js'

test('a fresh counter starts at one', () => {
  reset()
  assert.equal(increment(), 1)
})
