import assert from 'node:assert/strict'
import { test } from 'node:test'

import { debounce } from '../src/debounce.js'

// Fake timers and clocks, installed before the first test.
let queue = []
globalThis.setTimeout = callback => queue.push(callback)
globalThis.clearTimeout = id => {
  queue[id - 1] = null
}
Date.now = () => 0
performance.now = () => 0

function flush() {
  for (let callback of queue.splice(0)) {
    callback?.()
  }
}

test('calls once', () => {
  let calls = 0
  let run = debounce(() => {
    calls += 1
  }, 10)
  run()
  run()
  flush()
  assert.equal(calls, 1)
})
