const { square, isSet } = require('../src/parallel')

test.concurrent('squares', async () => {
  expect(await square(3)).toBe(9)
})

test.concurrent('tells a set value', async () => {
  expect(await isSet(1)).toBe(true)
})
