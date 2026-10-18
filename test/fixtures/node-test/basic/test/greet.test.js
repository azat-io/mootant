import { fork } from 'node:child_process'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'

import { greet } from '../src/greet.js'

test('greets', () => {
  assert.equal(greet('Ann'), 'Hello, Ann')
})

// The child inherits mootant's preload, which must stay silent there.
test('forks a quiet child', async () => {
  let child = fork(new URL('../scripts/child.js', import.meta.url), {
    stdio: 'pipe',
  })
  let output = ''
  child.stdout.on('data', chunk => {
    output += chunk
  })
  await once(child, 'exit')
  assert.equal(output, 'ready\n')
})
