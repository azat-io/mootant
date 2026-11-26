let limits = require('limits-pkg')

let { isAdult } = require('../src/math')

test('tells adults', () => {
  expect(isAdult(limits.age)).toBe(true)
  expect(isAdult(5)).toBe(false)
})
