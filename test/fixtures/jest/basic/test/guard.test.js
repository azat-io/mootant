const { check } = require('../src/guard')

test('passes a good value', () => {
  check(true)
})
