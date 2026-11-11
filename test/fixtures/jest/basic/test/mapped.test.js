const { multiply } = require('@mapped')

test('loads through the mapper', () => {
  expect(multiply(2, 3)).toBe(6)
})
