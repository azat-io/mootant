import { expect, it } from 'vitest'

import { countDown, isPositive, add } from '../src/math'

it('adds', () => {
  expect(add(2, 3)).toBe(5)
})

it('checks the sign', () => {
  expect(isPositive(1)).toBe(true)
})

it('counts down', () => {
  expect(countDown(3)).toBe(3)
})
