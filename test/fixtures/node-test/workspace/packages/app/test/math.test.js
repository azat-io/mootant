import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isAdult } from '../src/math.js'

let limits = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/limits.json', import.meta.url),
    'utf8',
  ),
)

test('tells adults', () => {
  assert.equal(isAdult(limits.age), true)
  assert.equal(isAdult(5), false)
})
