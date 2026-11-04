import { expect, it } from 'vitest'

import { isFree } from '../src/price.js'

// A legitimately slow test with its own long timeout, as integration tests have.
it('waits 65 s, then checks', async () => {
  await new Promise(resolve => setTimeout(resolve, 65_000))
  expect(isFree(0)).toBe(true)
}, 120_000)
