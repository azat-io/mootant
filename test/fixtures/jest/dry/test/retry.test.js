const { add } = require('../src/math')

jest.retryTimes(1)

let runs = 0

test('passes on retry', () => {
  runs += 1
  expect(add(runs, 0)).toBe(2)
})
