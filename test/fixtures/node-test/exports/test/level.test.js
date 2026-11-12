import assert from 'node:assert/strict'
import { test } from 'node:test'

import levels, { level, raise } from '../src/level.cjs'

test('starts at one and raises', () => {
  assert.equal(level, 1)
  assert.equal(raise(2), 3)
  assert.equal(levels.level, 3)
  assert.equal(Object.keys(levels).includes('level'), true)
})
