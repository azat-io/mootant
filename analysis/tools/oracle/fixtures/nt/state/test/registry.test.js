import assert from 'node:assert/strict'
import { test } from 'node:test'

import { limit, register } from '../src/registry.js'

test('registers once', () => {
  assert.equal(register('a'), 1)
  assert.equal(register('a'), 1)
})

test('limit from env', () => {
  process.env.ORACLE_LIMIT = '7'
  assert.equal(limit(), 7)
})

test('array helper', () => {
  assert.equal([1, 2, 3].oracleLast(), 3)
})
