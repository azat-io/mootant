import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { formatPrice, wait } from '../src/format.js'

describe('prices', { concurrency: true }, () => {
  test('one fifty', async () => {
    await wait(20)
    assert.equal(formatPrice(150), '$1.50')
  })
  test('zero', async () => {
    await wait(10)
    assert.equal(formatPrice(0), '$0.00')
  })
  test('cents', async () => {
    await wait(5)
    assert.equal(formatPrice(7), '$0.07')
  })
})
