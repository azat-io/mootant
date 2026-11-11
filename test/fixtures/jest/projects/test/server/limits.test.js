const { largest } = require('#limits')

test('finds the largest value through the resolver', () => {
  expect(largest([3, 9, 4])).toBe(9)
  expect(largest([])).toBeNull()
})
