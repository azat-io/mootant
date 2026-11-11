const { setTimeout: startCoreTimer } = require('node:timers')

const { leaves, scale } = require('../src/exit-leaves')

test('ends the process after the file ended, under the mutant', async () => {
  expect(scale(2)).toBeGreaterThan(0)
  if (leaves()) {
    startCoreTimer(() => {
      process.exit(7)
    }, 50)
  } else {
    await new Promise(resolve => {
      setTimeout(resolve, 150)
    })
  }
})
