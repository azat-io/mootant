import assert from 'node:assert/strict'
import { test } from 'node:test'

test('lazy import inside a test', async () => {
  let { lazyValue } = await import('../src/lazy.js')
  assert.equal(lazyValue(), 14)
})
