import assert from 'node:assert/strict'
import { test } from 'node:test'

test('greeting from the setup file', () => {
  assert.equal(globalThis.oracleGreeting, 'Hi setup')
})
