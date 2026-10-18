import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'

import { getBalance, deposit } from '../src/ledger.js'

// A root hook of the test file, which runs after mootant's hooks.
afterEach(() => {
  assert.ok(getBalance() >= 0)
})

test('deposits', () => {
  deposit(5)
})
