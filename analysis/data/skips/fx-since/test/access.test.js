import { expect, it } from 'vitest'

import { open } from '../src/access.js'

it('counts the entries', () => {
  let log = [{}, {}]
  expect(open({ isAdmin: false }, { unlock() {} }, log)).toBe(2)
  expect(log.every(entry => entry.seen)).toBe(true)
})
