import assert from 'node:assert/strict'
import { test } from 'node:test'

import { drain, retryWithBackoff } from '../src/retry.js'

test('succeeds on the third attempt', async () => {
  let calls = 0
  let value = await retryWithBackoff(async () => {
    calls++
    if (calls < 3) {
      throw new Error('flaky')
    }
    return 'ok'
  })
  assert.equal(value, 'ok')
  assert.equal(calls, 3)
})

test('drains three items', async () => {
  assert.equal(await drain(['a', 'b', 'c']), 3)
})
