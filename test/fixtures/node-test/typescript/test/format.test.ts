import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatPrice } from '../src/format.ts'

test('formats a small price', () => {
  assert.equal(formatPrice({ currency: 'EUR', amount: 9.5 }), '9.5 EUR')
})

test('rounds a large price', () => {
  assert.equal(formatPrice({ currency: 'EUR', amount: 120.4 }), '120 EUR')
})
