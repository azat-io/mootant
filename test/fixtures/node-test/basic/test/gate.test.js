import assert from 'node:assert/strict'
import { describe, before, it, test } from 'node:test'

import { opened } from '../src/gate.js'

test.todo('opens on schedule', () => {
  assert.fail('not yet')
})

// A failing suite hook fails the run, whatever the todo test did.
describe('gate', () => {
  before(() => {
    assert.ok(opened('open'))
  })

  it('stays shut', () => {
    assert.ok(!opened('shut'))
  })
})
