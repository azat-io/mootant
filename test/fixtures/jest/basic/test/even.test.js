const { isEven } = require('../src/even')

test.failing('is wrong about an odd number', () => {
  expect(isEven(3)).toBe(true)
})
