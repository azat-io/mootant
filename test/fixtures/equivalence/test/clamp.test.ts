import { expect, it } from 'vitest'

import { clamp } from '../src/clamp'

it('raises to the low end', () => {
  expect(clamp(-1, 0, 10)).toBe(0)
})

it('lowers to the high end', () => {
  expect(clamp(11, 0, 10)).toBe(10)
})

it('keeps a value inside', () => {
  expect(clamp(5, 0, 10)).toBe(5)
})
