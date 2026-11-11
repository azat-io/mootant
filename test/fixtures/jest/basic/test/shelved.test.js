const { double, triple } = require('../src/shelved')

test('doubles', () => {
  expect(double(2)).toBe(4)
})

test.skip('triples', () => {
  expect(triple(2)).toBe(0)
})

test.todo('halves')
