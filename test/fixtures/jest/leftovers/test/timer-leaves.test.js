const { setTimeout: startCoreTimer } = require('node:timers')

const { leaves, scale } = require('../src/timer-leaves')

test('starts timers that throw after the file ended, under the mutant', async () => {
  expect(scale(2)).toBeGreaterThan(0)
  if (leaves()) {
    setTimeout(() => {
      throw new Error('A timer of the test fired after its file ended.')
    }, 50)
    startCoreTimer(() => {
      throw new Error('A timer of a core module fired after its file ended.')
    }, 50)
  } else {
    await new Promise(resolve => {
      setTimeout(resolve, 150)
    })
  }
})
