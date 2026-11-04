import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { test } from 'vitest'

import { add } from '../src/math.js'

let counter = '/tmp/claude-0/static-loadcache-runs'
let runs = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
writeFileSync(counter, String(runs + 1))

// The second load of this file fails, as a test file that connects to a
// service at the top level fails while the service restarts; it never calls
// `add` while loading.
if (runs === 1) {
  throw new Error('connect ECONNREFUSED 127.0.0.1:5432')
}

// Reaches `add` but checks nothing, so every mutant of `add` survives a plain
// run of the tests.
test('add runs', () => {
  add(1, 1)
})
