const { double } = require('../src/bom')

test('doubles', () => {
  expect(double(4)).toBe(8)
})
