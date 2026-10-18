import { after, test } from 'node:test'
import assert from 'node:assert/strict'

import { double } from '../src/tally.js'

let results = []

// A root hook of the test file, the only one that checks the results. Plain
// `node` passes when it fails from Node 22 on, `node --test` does not.
after(() => {
  assert.deepEqual(results, [4])
})

test('doubles', () => {
  results.push(double(2))
})
