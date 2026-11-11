const { value } = require('../src/unref-a-plain')

// Keeps a slot busy while the file with the server runs on the other, and is no
// kill itself.
test('takes a moment', async () => {
  await new Promise(resolve => {
    setTimeout(resolve, 200)
  })
  expect(value?.() ?? 1).toBeGreaterThan(-1)
})
