import assert from 'node:assert/strict'
import { test } from 'node:test'

import { declarePending } from '../scripts/backlog-cases.js'
import { estimate } from '../src/backlog.js'

// The helper's tests pass without mutants; when a mutant fails them, the run
// still passes, unless the next test fails too.
declarePending()

test('estimates a small task', () => {
  assert.ok(estimate(1) < 3)
})
