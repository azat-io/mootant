const { connect } = require('../src/connect')

beforeAll(() => {
  connect('local')
})

test('runs after the connection', () => {
  expect(1).toBe(1)
})
