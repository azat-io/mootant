import { expect, it } from 'vitest'

import { settle } from '../src/settle'

process.on('unhandledRejection', () => {})

it('settles', async () => {
  expect(settle(1)).toBe(1)
  await new Promise(resolve => {
    setTimeout(resolve, 10)
  })
})
