import { expect, test } from 'vitest'

import { limit, register } from '../src/registry.js'

test('registers once', () => {
  expect(register('a')).toBe(1)
  expect(register('a')).toBe(1)
})

test('limit from env', () => {
  process.env.ORACLE_LIMIT = '7'
  expect(limit()).toBe(7)
})

test('array helper', () => {
  expect([1, 2, 3].oracleLast()).toBe(3)
})
