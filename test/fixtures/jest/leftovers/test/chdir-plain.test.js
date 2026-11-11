const path = require('node:path')

const { double, isPositive } = require('../src/chdir-plain')

test('stays clean while what the file before left is around', async () => {
  expect(double(2)).toBe(4)
  expect(isPositive(1)).toBe(true)
  await new Promise(resolve => {
    setTimeout(resolve, 150)
  })
  expect(process.cwd()).toBe(path.dirname(__dirname))
})
