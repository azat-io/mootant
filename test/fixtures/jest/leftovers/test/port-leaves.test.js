const { createConnection, createServer } = require('node:net')
const { createHash } = require('node:crypto')

const { leaves, scale } = require('../src/port-leaves')

// One fixed port per copy of the project, below the ranges of ephemeral ports.
let hash = createHash('sha1').update(__dirname).digest('hex')
let port = 20_000 + (Number.parseInt(hash.slice(0, 4), 16) % 10_000)

// A server here ends when another run connects, so a run with no mutant after a
// failure finds the port free.
test('takes a fixed port, and leaves it taken under the mutant', async () => {
  expect(scale(2)).toBeGreaterThan(0)
  let left = leaves()
  let server = createServer(socket => {
    socket.destroy()
    server.close()
  })
  await new Promise((resolve, reject) => {
    server.on('error', () => {
      createConnection(port, '127.0.0.1').once('close', () => {
        reject(new Error(`Port ${port} is taken.`))
      })
    })
    server.listen(port, '127.0.0.1', resolve)
  })
  if (!left) {
    await new Promise(resolve => {
      server.close(resolve)
    })
  }
})
