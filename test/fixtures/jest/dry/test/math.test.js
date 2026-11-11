const { double, add } = require('../src/math')

test('adds', () => {
  console.log(`logged by adds, worker id ${process.env.JEST_WORKER_ID}`)
  expect(add(1, 2)).toBe(3)
})

describe('inside a block', () => {
  test('doubles', () => {
    expect(double(2)).toBe(4)
  })
})

test.todo('is written later')

test.skip('is left out', () => {
  expect(add(1, 1)).toBe(3)
})
