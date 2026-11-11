const { createHash } = require('node:crypto')
const { createServer } = require('node:net')

const { holds, value } = require('../src/hold-leaves')

// One fixed port per copy of the project, which two test files take only under
// a mutant, so no run with no mutant can see it taken.
let hash = createHash('sha1').update(__dirname).digest('hex')
let port = 10_000 + (Number.parseInt(hash.slice(0, 4), 16) % 10_000)

test('takes a fixed port under a mutant, and leaves it', async () => {
  expect(value()).toBe(1)
  if (holds()) {
    let server = createServer()
    await new Promise((resolve, reject) => {
      server.on('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })
    // A handle that keeps nothing alive is one no guard of a worker can see.
    server.unref()
  }
})
