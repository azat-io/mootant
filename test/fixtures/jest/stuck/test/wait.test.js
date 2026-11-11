const { isReady } = require('../src/wait')

test('is ready', () => {
  expect(isReady(1)).toBe(true)
})

// A synchronous loop, in every run: a promise that never settles only fails by
// Jest's own timeout.
test('waits forever', () => {
  while (true) {}
})
