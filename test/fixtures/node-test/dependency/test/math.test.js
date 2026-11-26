import assert from 'node:assert/strict'
import { test } from 'node:test'
import limits from 'limits-pkg'

import { isAdult } from '../src/math.js'

test('tells adults', () => {
  assert.equal(isAdult(limits.age), true)
  assert.equal(isAdult(5), false)
})
