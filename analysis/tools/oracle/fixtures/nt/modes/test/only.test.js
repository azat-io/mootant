import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatPrice, plural } from '../src/format.js'

test.only('only this test runs without --test-only too', () => {
  assert.match(formatPrice(250), /2/)
})

test('not run with --test-only', () => {
  assert.equal(plural(0, 'dog'), 'dogs')
  assert.equal(formatPrice(250), '$2.50')
})
