import assert from 'node:assert/strict'
import { test } from 'node:test'

import { plural, range } from '../src/format.js'

test('range and plural', () => {
  assert.deepEqual(range(2), [0, 1])
  assert.equal(plural(1, 'box'), 'box')
  assert.equal(plural(2, 'item'), 'items')
})
