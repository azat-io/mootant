const {
  looseSecond,
  looseFirst,
  looseThird,
  before,
  inside,
} = require('../src/orders')

test('creates an order, checks it and deletes it', async () => {
  expect(before()).toBe(1)
  expect(looseFirst()).toBeGreaterThan(0)
  expect(looseSecond()).toBeGreaterThan(0)
  expect(looseThird()).toBeGreaterThan(0)
  let created = await fetch(`${process.env.STORE_URL}/order`, { method: 'PUT' })
  expect(created.status).toBe(201)
  expect(inside()).toBe(2)
  await fetch(`${process.env.STORE_URL}/order`, { method: 'DELETE' })
})
