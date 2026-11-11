const { existsSync } = require('node:fs')
const path = require('node:path')

const { isPositive, double } = require('../src/second')

test('has the resource of its worker', async () => {
  await new Promise(resolve => {
    setTimeout(resolve, 60)
  })
  let resource = path.join(
    __dirname,
    '../resources',
    process.env.JEST_WORKER_ID,
  )
  expect(existsSync(resource)).toBe(true)
  expect(double(2)).toBe(4)
  expect(isPositive(1)).toBeDefined()
})
