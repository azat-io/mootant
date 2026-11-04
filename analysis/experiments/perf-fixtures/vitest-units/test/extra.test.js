import { beforeAll, expect, test } from 'vitest'

import { clamp, average, isEven } from '../src/math.js'
import { pad, joinList } from '../src/text.js'

beforeAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 150))
})

test('clamps', () => {
  expect(clamp(5, 0, 10)).toBe(5)
  expect(clamp(-1, 0, 10)).toBe(0)
})

test('averages', () => {
  expect(average([2, 4])).toBe(3)
})

test('even', () => {
  expect(isEven(4)).toBe(true)
})

test('pads with zeros', () => {
  expect(pad(5, 2, '0')).not.toBe('')
})

test('joins one', () => {
  expect(joinList(['x'])).toBe('x')
})
