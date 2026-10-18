import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FIELDS } from '../src/schema.js'

test('lists the fields', () => {
  assert.deepEqual(FIELDS, ['id', 'name'])
})
