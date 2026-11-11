const { setTimeout: startCoreTimer } = require('node:timers')

const { leaves, scale } = require('../src/rejection-leaves')

test('rejects after the file ended, under the mutant', async () => {
  expect(scale(2)).toBeGreaterThan(0)
  if (leaves()) {
    startCoreTimer(() => {
      Promise.reject(new Error('A rejection came after its file ended.'))
    }, 50)
  } else {
    await new Promise(resolve => {
      setTimeout(resolve, 150)
    })
  }
})
