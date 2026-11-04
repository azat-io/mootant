import { expect, test } from 'vitest'

import { plural } from '../src/format.js'

let attempts = 0

test('passes on the second attempt', { retry: 2 }, () => {
  attempts++
  expect(attempts).toBeGreaterThan(1)
  expect(plural(1, 'box')).toBe('box')
})

test('repeated', { repeats: 2 }, () => {
  expect(plural(3, 'cat')).toBe('cats')
})
