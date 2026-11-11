const { globalAgent } = require('node:http')

const { poolSize, leaves, scale } = require('../src/web-agent-leaves')

// Changes a property of an object a core module holds, which no guard sees,
// and never puts it back.
test('finds the shared agent as a new process has it', () => {
  expect(scale(2)).toBeGreaterThan(0)
  if (leaves()) {
    globalAgent.maxSockets = 1
  }
  expect(poolSize()).toBe(8)
})
