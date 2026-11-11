let { double, label } = require('../src/size')

test('doubles', () => {
  expect(double(2)).toMatchSnapshot()
})

test('labels big values', () => {
  expect(label(20)).toBe('big')
})
