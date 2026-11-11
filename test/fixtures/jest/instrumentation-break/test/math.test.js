const { sign } = require('../src/math')

test('gives the sign of a number', () => {
  expect(sign(5)).toBe(1)
  expect(sign(-2)).toBe(-1)
})
