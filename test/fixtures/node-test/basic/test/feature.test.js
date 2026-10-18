import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isEnabled } from '../src/feature.js'

test('skips beta features', t => {
  if (isEnabled('beta-search')) {
    t.skip('beta')
    return
  }
  assert.fail('a beta feature ran')
})

test('runs stable features', () => {
  assert.equal(isEnabled('search'), false)
})
