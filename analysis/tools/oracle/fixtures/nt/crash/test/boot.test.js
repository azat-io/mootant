import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mode } from '../src/boot.js'

test('mode', () => {
  assert.equal(mode(), 'test')
})
