const { MAX } = require('../src/limits')

test('has the limit', () => {
  expect(MAX).toBe(10)
})
