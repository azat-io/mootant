const { createHash } = require('node:crypto')
const { createServer } = require('node:net')
const path = require('node:path')

const { value, other } = require('../src/c-port')

// One fixed port per copy of the project, shared by its test files, which plain
// Jest never runs at once under `--detectOpenHandles`.
let root = path.dirname(__dirname)
let hash = createHash('sha1').update(root).digest('hex')
let port = 10_000 + (Number.parseInt(hash.slice(0, 4), 16) % 10_000)

test('owns the port for a moment', async () => {
  expect(value()).toBe(1)
  expect(other()).toBeGreaterThan(-100)
  let server = createServer()
  await new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  await new Promise(resolve => {
    setTimeout(resolve, 60)
  })
  await new Promise(resolve => {
    server.close(resolve)
  })
})
