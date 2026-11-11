const { isFree, price } = require('../src/mocked')

// The mock takes `price`, so no test reaches its mutants.
jest.mock('../src/mocked', () => ({
  ...jest.requireActual('../src/mocked'),
  price: () => 1,
}))

test('uses the mock and the real function', () => {
  expect(price()).toBe(1)
  expect(isFree(0)).toBe(true)
  expect(isFree(1)).toBe(false)
})
