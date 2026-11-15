import { expect, it } from 'vitest'

import { emitLater, settle } from '../src/events'

it('emits without a listener', async () => {
  expect(emitLater()).toBe(true)
  await new Promise(resolve => {
    setTimeout(resolve, 10)
  })
})

it('settles', async () => {
  expect(settle(1)).toBe(1)
  await new Promise(resolve => {
    setTimeout(resolve, 10)
  })
})
