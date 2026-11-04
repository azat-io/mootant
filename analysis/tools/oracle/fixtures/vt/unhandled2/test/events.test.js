import { expect, test } from 'vitest'

import { emitLater, settle } from '../src/events.js'

test('emits without a listener', async () => {
  expect(emitLater(undefined)).toBe(true)
  await new Promise(resolve => setTimeout(resolve, 10))
})

test('settles', async () => {
  expect(settle(1)).toBe(1)
  await new Promise(resolve => setTimeout(resolve, 10))
})
