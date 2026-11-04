import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { test } from 'vitest'

import { add } from '../src/math.js'

let counter = new URL('../.runs', import.meta.url)

// The second run of this file dies before anything calls `add`, as a worker
// that the OOM killer stops would; every other run lives.
test('dies once', () => {
  let runs = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
  writeFileSync(counter, String(runs + 1))
  if (runs === 1) {
    process.kill(process.pid, 'SIGKILL')
  }
})

// Reaches `add` but checks nothing, so every mutant of `add` survives a plain
// run of the tests.
test('add runs', () => {
  add(1, 1)
})
