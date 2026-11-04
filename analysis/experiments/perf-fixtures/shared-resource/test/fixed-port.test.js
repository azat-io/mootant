import { createServer } from 'node:http'
import { expect, test } from 'vitest'

import { label } from '../src/label.js'

// A fixed port, as tests of a server or of a client against a local server do.
let port = 47_531

test('serves labels on a fixed port', async () => {
  let body = [0, 1, 3, 7].map(count => label(count)).join(',')
  let server = createServer((_request, response) => {
    response.end(body)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  try {
    await new Promise(resolve => setTimeout(resolve, 300))
    let response = await fetch(`http://127.0.0.1:${port}/`)
    expect(await response.text()).toBe('none,one,few,many')
  } finally {
    await new Promise(resolve => {
      server.close(resolve)
    })
  }
})
