import { afterAll, beforeAll, expect, test } from 'vitest'

import { connect, disconnect, selfDestruct } from '../src/db.js'

let db

beforeAll(() => {
  db = connect('mem://x')
})

afterAll(() => {
  disconnect(db)
})

test('uses the db', () => {
  expect(db.url).toBe('mem://x')
})

test('stays alive', () => {
  expect(selfDestruct(false)).toBe('alive')
})
