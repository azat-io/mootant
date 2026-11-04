import { expect, test } from 'vitest'

import { formatPrice, plural } from '../src/format.js'

test.only('only this test runs', () => {
  expect(formatPrice(250)).toContain('2')
})

test('not run because of only', () => {
  expect(plural(0, 'dog')).toBe('dogs')
  expect(formatPrice(250)).toBe('$2.50')
})
