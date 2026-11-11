const { createUser } = require('../src/users')

test('creates a user once', async () => {
  let created = await createUser('ann', 20)

  expect(created.status).toBe(201)
  expect(created.adult).toBe(true)
})
