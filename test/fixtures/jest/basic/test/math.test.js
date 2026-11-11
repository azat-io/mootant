const { isPositive, add } = require('../src/math')

test('adds', () => {
  expect(add(2, 3)).toBe(5)
})

test('tells a positive number', () => {
  expect(isPositive(1)).toBe(true)
  expect(isPositive(-1)).toBe(false)
})
