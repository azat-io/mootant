const { label } = require('../src/options')

test('labels with the text of the transformer options', () => {
  expect(label('apples', 3)).toBe('apples (3) from the options')
  expect(label('pear', 1)).toBe('pear from the options')
})
