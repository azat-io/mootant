import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatPrice, plural } from '../src/format.js'

test.skip('skipped test would kill', () => {
  assert.equal(formatPrice(100), 'nope')
})

test.todo('todo test that fails', () => {
  assert.equal(plural(5, 'cow'), 'nope')
})

test('runs', () => {
  assert.match(formatPrice(100), /\$/)
})
