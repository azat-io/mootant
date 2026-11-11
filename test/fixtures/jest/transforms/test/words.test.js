const { plural } = require('../src/generated/words')

test('says a word for a count', () => {
  expect(plural('apple', 1)).toBe('apple')
  expect(plural('apple', 2)).toBe('apples')
})
