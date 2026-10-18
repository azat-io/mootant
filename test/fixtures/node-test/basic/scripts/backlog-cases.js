import assert from 'node:assert/strict'
import { describe, test, it } from 'node:test'

import { estimate, share } from '../src/backlog.js'

// Declares tests marked todo for a test file whose own text never says so.
export function declarePending() {
  test('estimates a large task', { todo: 'pending' }, () => {
    assert.equal(estimate(4), 8)
  })

  // Before Node 22.23 or so, the tests of a todo suite and the subtests of a
  // todo test are not todo themselves, so their failures fail the run.
  describe('shares in bulk', { todo: 'pending' }, () => {
    it('splits', () => {
      assert.equal(share(6, 3), 2)
    })
  })

  test('shares evenly', { todo: 'pending' }, async t => {
    await t.test('halves', () => {
      assert.equal(share(4, 2), 2)
    })
  })
}
