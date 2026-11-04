import { expect, it } from 'vitest'

import { ratio, toCount } from '../src/nan.js'

it('divides', () => {
  expect(ratio(1, 2)).toBe(0.5)
  expect(ratio(0, 5)).toBe(0)
})

it('parses a count', () => {
  expect(toCount('5')).toBe(5)
  expect(toCount('')).toBe(0)
})
