const { fib } = require('../src/fib')

test('computes the 25th number', () => {
  expect(fib(25)).toBe(75025)
})
