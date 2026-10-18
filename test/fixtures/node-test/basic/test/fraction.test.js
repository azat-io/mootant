import assert from 'node:assert/strict'
import { test } from 'node:test'

import { third, half } from '../src/fraction.js'

test('halves', () => {
  assert.equal(half(4), 2)
})

// Fails in every run, which a todo test may.
test.todo('rounds thirds', () => {
  assert.equal(third(1), 0.33)
})

// Passes without mutants; when a mutant fails it, the run still passes.
test('divides by three', { todo: true }, () => {
  assert.equal(third(3), 1)
})

test('halves again', () => {
  assert.equal(half(8), 4)
})
