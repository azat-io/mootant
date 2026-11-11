const { double, isPositive } = require('../src/exit-plain')

test('stays clean while what the file before left is around', async () => {
  expect(double(2)).toBe(4)
  expect(isPositive(1)).toBe(true)
  await new Promise(resolve => {
    setTimeout(resolve, 150)
  })
})
