import assert from 'node:assert/strict'
import { test } from 'node:test'

import { announce } from '../src/announce.js'

// The listener fails after the test returned, as an unhandled rejection.
test('announces', () => {
  let sent = announce(message => {
    assert.equal(message, 'save done')
  }, 'save')
  assert.equal(sent, true)
})
