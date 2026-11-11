const { createHash } = require('node:crypto')
const { createServer } = require('node:net')

const {
  fourthCheck,
  fourthLoose,
  secondCheck,
  secondLoose,
  firstCheck,
  firstLoose,
  thirdCheck,
  thirdLoose,
} = require('../src/unref-leaves')

// One fixed port per copy of the project, below the ranges of ephemeral ports.
let hash = createHash('sha1').update(__filename).digest('hex')
let port = 10_000 + (Number.parseInt(hash.slice(0, 4), 16) % 10_000)

test('takes a fixed port, and closes it only when its checks pass', async () => {
  expect(firstLoose()).toBeGreaterThan(0)
  expect(secondLoose()).toBeGreaterThan(0)
  expect(thirdLoose()).toBeGreaterThan(0)
  expect(fourthLoose()).toBeGreaterThan(0)
  let server = createServer()
  await new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  // A handle that keeps nothing alive is one no guard of a worker can see.
  server.unref()
  await new Promise(resolve => {
    setTimeout(resolve, 120)
  })
  expect(firstCheck()).toBe(1)
  expect(secondCheck()).toBe(2)
  expect(thirdCheck()).toBe(3)
  expect(fourthCheck()).toBe(4)
  await new Promise(resolve => {
    server.close(resolve)
  })
})
