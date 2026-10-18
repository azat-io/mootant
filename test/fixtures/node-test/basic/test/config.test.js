import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getRetries } from '../src/config.js'

test('reads the defaults', () => {
  assert.equal(getRetries({}), 3)
  assert.equal(getRetries({ retries: 1 }), 1)
})
