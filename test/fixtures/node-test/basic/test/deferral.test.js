import assert from 'node:assert/strict'
import { test } from 'node:test'

import { deferred } from '../src/deferral.js'

// Marks itself todo only when a mutant defers what it checks, so its failure
// comes after the mutant was reached in a file whose dry run had no todo test.
test('keeps soon tasks', t => {
  if (deferred('soon')) {
    t.todo('deferred')
  }
  assert.equal(deferred('soon'), false)
})

test('defers late tasks', () => {
  assert.equal(deferred('later'), true)
})
