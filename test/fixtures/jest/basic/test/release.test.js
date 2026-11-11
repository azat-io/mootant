const { release } = require('../src/release')

afterAll(() => {
  release(false)
})

test('runs before the release', () => {
  expect(1).toBe(1)
})
