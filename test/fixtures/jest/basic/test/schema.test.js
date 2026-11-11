const fields = require('../src/schema')

test('has the fields', () => {
  expect(fields).toHaveLength(1)
})
