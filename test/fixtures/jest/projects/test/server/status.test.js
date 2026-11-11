const { ping } = require('../../src/status')

test('asks the server global setup started', async () => {
  await expect(ping()).resolves.toBe('pong')
})
