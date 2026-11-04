import assert from 'node:assert/strict'
import { test } from 'node:test'

import { LIMIT, NAMES, SETTINGS } from '../src/constants.js'

test('limit', () => {
  assert.equal(LIMIT, 6)
})

test('names', () => {
  assert.deepEqual(NAMES, ['A', 'B'])
})

test('settings', () => {
  assert.equal(SETTINGS.retries, 2)
})
