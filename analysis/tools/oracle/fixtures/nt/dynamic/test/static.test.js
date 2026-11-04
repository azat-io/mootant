import assert from 'node:assert/strict'
import { test } from 'node:test'

import { add } from '../src/math.js'

test('add of zeros', () => {
  assert.equal(add(0, 0), 0)
})
