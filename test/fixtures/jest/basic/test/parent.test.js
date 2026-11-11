const { fork } = require('node:child_process')
const path = require('node:path')

const { tidy } = require('../src/parent')

test('reads what a child sent', async () => {
  let child = fork(path.join(__dirname, '../scripts/child.js'))
  let [message] = await Promise.all([
    new Promise(resolve => {
      child.once('message', resolve)
    }),
    new Promise(resolve => {
      child.once('exit', resolve)
    }),
  ])
  expect(tidy(message)).toBe('ready')
}, 10_000)
