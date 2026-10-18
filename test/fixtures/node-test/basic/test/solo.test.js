import assert from 'node:assert/strict'
import { test } from 'node:test'

import { triple } from '../src/solo.js'

// Runs alone only with --test-only, which the test command does not give, while
// plain `node` honours it by itself from Node 24 on.
test.only('smoke', () => {
  triple(1)
})

test('triples', () => {
  assert.equal(triple(2), 6)
})
