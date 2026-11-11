const { getBalance, deposit } = require('../src/ledger')

afterEach(() => {
  expect(getBalance()).toBeGreaterThanOrEqual(0)
})

test('deposits', () => {
  deposit(5)
})
