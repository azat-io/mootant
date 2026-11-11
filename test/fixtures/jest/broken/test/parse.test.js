const { parse } = require('../src/parse')

test('splits', () => {
  expect(parse('a,b')).toEqual(['a', 'b'])
})

// The test file fails to load in every run.
throw new Error('Missing fixture data')
