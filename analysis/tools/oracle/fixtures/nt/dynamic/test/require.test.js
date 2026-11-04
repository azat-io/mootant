import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

let require = createRequire(import.meta.url)
let { clamp } = require('../src/legacy.cjs')

test('clamp through require', () => {
  assert.equal(clamp(5, 0, 3), 3)
  assert.equal(clamp(-1, 0, 3), 0)
})
