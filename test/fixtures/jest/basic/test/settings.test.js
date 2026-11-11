const { withDefault } = require('../src/settings')

test('reads the defaults', () => {
  expect(withDefault(1)).toBe(4)
})
