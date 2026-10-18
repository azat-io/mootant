import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { clamp } from '../src/range.js'

describe('clamp', () => {
  // A failing subtest fails the test around it.
  test('keeps values in range', async t => {
    await t.test('below', () => {
      assert.equal(clamp(-5, 0, 10), 0)
    })
    await t.test('inside', () => {
      assert.equal(clamp(5, 0, 10), 5)
    })
    await t.test('above', () => {
      assert.equal(clamp(15, 0, 10), 10)
    })
  })
})
