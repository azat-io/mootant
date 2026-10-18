import assert from 'node:assert/strict'
import { test } from 'node:test'

import { STATUS, MAX } from '../src/limits.js'

test('has the limits', () => {
  assert.equal(MAX, 10)
  assert.equal(STATUS, 'READY')
})
