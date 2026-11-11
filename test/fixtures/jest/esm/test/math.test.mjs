import { average, sign } from '../src/math.mjs'

test('gives the sign of a number', () => {
  expect(sign(5)).toBe(1)
  expect(sign(-2)).toBe(-1)
})

test('averages', () => {
  expect(average([2, 4])).toBe(3)
})
