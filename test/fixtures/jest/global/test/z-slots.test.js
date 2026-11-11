const { looseSecond, looseFirst, before, inside } = require('../src/z-slots')

// A key per worker, as Jest's docs suggest for what workers must not share.
let url = `${process.env.STORE_URL}/order-${process.env.JEST_WORKER_ID}`

test('creates an order of its worker, checks it and deletes it', async () => {
  expect(before()).toBe(1)
  expect(looseFirst()).toBeGreaterThan(0)
  expect(looseSecond()).toBeGreaterThan(0)
  let created = await fetch(url, { method: 'PUT' })
  expect(created.status).toBe(201)
  expect(inside()).toBe(2)
  await fetch(url, { method: 'DELETE' })
})
