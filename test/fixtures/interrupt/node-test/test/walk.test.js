import { it } from 'node:test'
import assert from 'node:assert/strict'

import { walk } from '../lib/walk.js'

it('walks to n', () => {
  assert.equal(walk(3), 3)
})
