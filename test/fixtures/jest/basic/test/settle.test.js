const { settle } = require('../src/settle')

test('waits for what is pending', async () => {
  let pending = { done: false }
  pending.promise = new Promise(resolve => {
    setTimeout(() => {
      pending.done = true
      resolve()
    }, 10)
  })
  await settle(pending)
  expect(pending.done).toBe(true)
})
