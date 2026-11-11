const { wantsShot } = require('../src/shots')

test('checks a snapshot when asked', () => {
  if (wantsShot()) {
    expect('kept').toMatchSnapshot()
  }
})

test('checks another', () => {
  expect('other').toMatchSnapshot()
})
