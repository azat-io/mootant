import assert from 'node:assert/strict'
import { test } from 'node:test'

import { check } from '../src/guard.js'

test('passes a good value', () => {
  assert.equal(check(true), true)
})
