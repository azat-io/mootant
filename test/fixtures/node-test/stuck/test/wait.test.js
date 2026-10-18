import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isReady } from '../src/wait.js'

test('is ready', () => {
  assert.equal(isReady(1), true)
})

// Never settles and keeps the process alive, in every run.
test('waits forever', () => new Promise(() => setInterval(() => {}, 1000)))
