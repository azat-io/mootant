import assert from 'node:assert/strict'
import { test } from 'node:test'

import { countdown } from '../src/countdown.js'

test('counts down', () => {
  assert.equal(countdown(6, 2), 3)
})
