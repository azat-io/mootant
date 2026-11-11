const { writeFileSync } = require('node:fs')
const { getHeapStatistics } = require('node:v8')
const { Worker } = require('node:worker_threads')
const { fork } = require('node:child_process')
const path = require('node:path')

test('writes what this process, a fork and a thread are limited to', async () => {
  let forked = await new Promise(resolve => {
    let child = fork(path.join(__dirname, '../child.js'))
    child.once('message', message => {
      child.disconnect()
      resolve(message)
    })
  })
  let thread = await new Promise(resolve => {
    new Worker(
      `const { parentPort } = require('node:worker_threads')
      const { getHeapStatistics } = require('node:v8')
      parentPort.postMessage(getHeapStatistics().heap_size_limit)`,
      { eval: true },
    ).once('message', resolve)
  })
  writeFileSync(
    path.join(__dirname, '../limits.json'),
    JSON.stringify({
      variable: process.env.MOOTANT_HEAP_FLAG ?? null,
      own: getHeapStatistics().heap_size_limit,
      flags: process.execArgv,
      forked,
      thread,
    }),
  )
})
