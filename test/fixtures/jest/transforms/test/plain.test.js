const { clamp } = require('../src/plain')

test('keeps a value in its range', () => {
  expect(clamp(5, 0, 10)).toBe(5)
  expect(clamp(-1, 0, 10)).toBe(0)
  expect(clamp(11, 0, 10)).toBe(10)
})
