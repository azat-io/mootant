const { isEven } = require('../src/shebang')

test('tells even numbers', () => {
  expect(isEven(4)).toBe(true)
  expect(isEven(3)).toBe(false)
})
