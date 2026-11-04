import { expect, test } from 'vitest'

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
  expect(value).toBe('ok')
  expect(calls).toBe(3)
})

test('drains three items', async () => {
  expect(await drain(['a', 'b', 'c'])).toBe(3)
})
