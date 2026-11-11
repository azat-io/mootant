const { isLarge, isSmall, halve } = require('../src/retried')

jest.retryTimes(1)

let attempts = 0

// Fails its first attempt whatever the mutant, and never reaches `isSmall`.
test('passes on retry', () => {
  attempts += 1
  let large = isLarge(2)
  expect(attempts).toBe(2)
  expect(large).toBe(true)
})

test('tells a small number', () => {
  expect(isSmall(8)).toBe(true)
})

test('fails every time under a mutant', () => {
  expect(halve(4)).toBe(2)
})
