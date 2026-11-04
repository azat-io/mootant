import assert from 'node:assert/strict'
import { test } from 'node:test'

import { wait, withRetry } from '../src/format.js'

test('mock timers resolve wait', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let done = false
  let promise = wait(1000).then(() => {
    done = true
  })
  t.mock.timers.tick(999)
  await Promise.resolve()
  assert.equal(done, false)
  t.mock.timers.tick(1)
  await promise
  assert.equal(done, true)
})

test('retry gives up after the attempts', async () => {
  let calls = 0
  await assert.rejects(
    withRetry(() => {
      calls++
      throw new Error('nope')
    }, 2),
    /nope/,
  )
  assert.equal(calls, 2)
})
