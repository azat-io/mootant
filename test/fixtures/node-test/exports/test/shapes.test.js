import assert from 'node:assert/strict'
import { test } from 'node:test'

import { area, perimeter } from '../src/shapes.cjs'

test('measures shapes', () => {
  assert.equal(area(2, 3), 6)
  assert.equal(perimeter(2, 3), 10)
})
