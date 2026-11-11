const { createHash } = require('node:crypto')
const { createServer } = require('node:net')

const { finds } = require('../src/hold-finds')

let hash = createHash('sha1').update(__dirname).digest('hex')
let port = 10_000 + (Number.parseInt(hash.slice(0, 4), 16) % 10_000)

// Runs first, so its retry takes the first slot, and waits for the other file to
// leave its server on the second.
test('takes a fixed port under a mutant, once the other file left it', async () => {
  await new Promise(resolve => {
    setTimeout(resolve, 600)
  })
  if (finds()) {
    let server = createServer()
    await new Promise((resolve, reject) => {
      server.on('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })
    await new Promise(resolve => {
      server.close(resolve)
    })
  }
})
