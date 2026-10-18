import assert from 'node:assert/strict'
import { test } from 'node:test'

import { check } from '../src/status.js'

test('checks', () => {
  assert.equal(check(5), 5)
})

// With a failing todo test, `node --test` passes a test file that sets a
// failing exit code.
test.todo('checks large values', () => {
  assert.fail('not yet')
})
