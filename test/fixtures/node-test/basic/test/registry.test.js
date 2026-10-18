import { describe, before, after, test } from 'node:test'
import assert from 'node:assert/strict'

import { register, size } from '../src/registry.js'

describe('registry', () => {
  before(() => {
    register('first')
  })

  test('has the first entry', () => {
    assert.equal(size(), 1)
  })

  // Only this hook checks what `register` returns.
  after(() => {
    assert.equal(register('last'), 2)
  })
})
