const { prepare } = require('../src/planned')

describe('what is planned', () => {
  beforeAll(() => {
    prepare(true)
  })

  test.todo('comes later')
})

test('runs beside what is planned', () => {
  expect(1).toBe(1)
})
