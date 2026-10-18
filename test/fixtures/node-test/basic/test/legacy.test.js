import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { triple } from '../src/legacy.cjs'

let require = createRequire(import.meta.url)
let { double } = require('../src/legacy.cjs')

test('doubles', () => {
  assert.equal(double(4), 8)
})

test('triples', () => {
  assert.equal(triple(2), 6)
})
