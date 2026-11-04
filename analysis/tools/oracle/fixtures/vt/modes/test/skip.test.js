import { expect, test } from 'vitest'

import { formatPrice } from '../src/format.js'

test.skip('skipped test would kill', () => {
  expect(formatPrice(100)).toBe('nope')
})

test.todo('todo test')

test('runs', () => {
  expect(formatPrice(100)).toContain('$')
})
