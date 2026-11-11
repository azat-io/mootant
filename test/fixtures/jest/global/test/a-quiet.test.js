const { value } = require('../src/a-quiet')

// Keeps the first slot busy while the file with a store per worker takes the
// second, and is no kill itself.
test('takes a moment', async () => {
  await new Promise(resolve => {
    setTimeout(resolve, 300)
  })
  expect(value?.() ?? 1).toBeGreaterThan(-1)
})
