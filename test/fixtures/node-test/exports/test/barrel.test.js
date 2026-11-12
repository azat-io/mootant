import assert from 'node:assert/strict'
import { test } from 'node:test'

import { area, label } from '../src/barrel.cjs'

test('reexports shapes', () => {
  assert.equal(area(2, 3), 6)
  assert.equal(label(2, 3), '2x3')
})
