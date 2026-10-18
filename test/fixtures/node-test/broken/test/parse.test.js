import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parse } from '../src/parse.js'

test('splits', () => {
  assert.deepEqual(parse('a,b'), ['a', 'b'])
})

// The test file fails to load in every run.
throw new Error('Missing fixture data')
