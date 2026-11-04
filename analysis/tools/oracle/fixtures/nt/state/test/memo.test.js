import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fib } from '../src/memo.js'

test('fib', () => {
  assert.equal(fib(25), 75025)
})
