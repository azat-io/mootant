const { load } = require('../src/deferred')

function nextTurn() {
  return new Promise(resolve => {
    setTimeout(resolve, 10)
  })
}

// A turn passes with no handler on what `load` gave, and one more with it.
beforeAll(async () => {
  let pending = load(true)
  await nextTurn()
  await pending.catch(() => {})
  await nextTurn()
})

test('runs after the load', () => {
  expect(1).toBe(1)
})
