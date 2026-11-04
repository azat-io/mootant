import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { connect, disconnect, selfDestruct } from '../src/db.js'

let db

before(() => {
  db = connect('mem://x')
})

after(() => {
  disconnect(db)
})

test('uses the db', () => {
  assert.equal(db.url, 'mem://x')
})

test('stays alive', () => {
  assert.equal(selfDestruct(false), 'alive')
})
