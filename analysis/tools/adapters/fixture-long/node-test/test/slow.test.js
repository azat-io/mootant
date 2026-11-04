import { it } from 'node:test'
import assert from 'node:assert/strict'

import { isFree } from '../src/price.js'

// A legitimately slow test with its own long timeout, as integration tests have.
it('waits 65 s, then checks', { timeout: 120_000 }, async () => {
  await new Promise(resolve => setTimeout(resolve, 65_000))
  assert.equal(isFree(0), true)
})
