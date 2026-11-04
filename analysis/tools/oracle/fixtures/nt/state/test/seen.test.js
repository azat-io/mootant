import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clear, track } from '../src/seen.js'

test('tracks a fresh id', () => {
  clear()
  assert.equal(track('x'), true)
})
