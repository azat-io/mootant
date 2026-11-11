const { marker, total } = require('../src/in-place')

test('reads what the transformer set in its options', () => {
  expect(marker()).toBe('set in place')
})

test('adds the values', () => {
  expect(total([1, 2, 3])).toBe(6)
})
