import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fib } from '../src/fib.js'

test('computes the 25th number', () => {
  assert.equal(fib(25), 75025)
})
