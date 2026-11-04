import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { before, test } from 'node:test'
import assert from 'node:assert/strict'

import { add } from '../src/math.js'

let counter = new URL('../.runs', import.meta.url)

// The second run of this file fails its setup, as a fixed port taken by a stray
// process would; every other run sets up fine. The hook never calls `add`.
before(() => {
  let runs = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
  writeFileSync(counter, String(runs + 1))
  if (runs === 1) {
    throw new Error('listen EADDRINUSE: address already in use :::4000')
  }
})

test('add', () => {
  assert.equal(add(2, 3), 5)
})
