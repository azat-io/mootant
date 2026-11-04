import { expect, test } from 'vitest'

import { average, clamp } from '../src/math.js'

test('clamps above', () => {
  expect(clamp(11, 0, 10)).toBe(10)
})

test('average of nothing', () => {
  expect(average([])).toBe(0)
})
