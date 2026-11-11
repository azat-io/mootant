const { increment, current } = require('../src/counter')

test('increments', () => {
  increment()
})

// Never reaches `increment`, but sees the count the first test left.
test('keeps the count', () => {
  expect(current()).toBe(1)
})
