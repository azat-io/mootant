import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { test, expect } from 'vitest'

import { add } from '../src/math.js'

let counter = new URL('../.runs', import.meta.url)

// The second run of this file is slow, as a test close to its timeout can be on
// a loaded machine; every other run is fast. The test never calls `add`.
test('slow once', async () => {
  let runs = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
  writeFileSync(counter, String(runs + 1))
  if (runs === 1) {
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
}, 1000)

test('add', () => {
  expect(add(2, 3)).toBe(5)
})
