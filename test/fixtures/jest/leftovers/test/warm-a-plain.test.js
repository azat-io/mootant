const { value } = require('../src/warm-a-plain')

// Keeps the first slot busy while the file that fails on a process that already
// ran it takes the second, so that only that worker holds what fails it.
test('takes a moment', async () => {
  await new Promise(resolve => {
    setTimeout(resolve, 300)
  })
  expect(value?.() ?? 1).toBeGreaterThan(-1)
})
