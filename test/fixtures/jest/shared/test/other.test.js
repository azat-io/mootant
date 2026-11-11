const { setTimeout: sleep } = require('node:timers/promises')

const { isLarge, triple } = require('../src/other')

// Keeps a second worker busy while the units of the other file wait their turn.
test('triples', async () => {
  await sleep(100)
  expect(triple(2)).toBe(6)
})

test('tells a large value', () => {
  expect(isLarge(20)).toBe(true)
})
