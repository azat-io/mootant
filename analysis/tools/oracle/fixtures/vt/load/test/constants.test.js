import { expect, test } from 'vitest'

import { LIMIT, NAMES, SETTINGS } from '../src/constants.js'

test('limit', () => {
  expect(LIMIT).toBe(6)
})

test('names', () => {
  expect(NAMES).toEqual(['A', 'B'])
})

test('settings', () => {
  expect(SETTINGS.retries).toBe(2)
})
