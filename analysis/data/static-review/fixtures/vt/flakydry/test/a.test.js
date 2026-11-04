import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { test, expect } from 'vitest'

import { add } from '../src/math.js'

let counter = new URL('../.runs', import.meta.url)

// Fails on the first run of this file only, as a flaky test does once in a
// while; it reaches `add` first.
test('add, flaky', () => {
  let runs = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0
  writeFileSync(counter, String(runs + 1))
  expect(add(2, 3)).toBe(5)
  expect(runs).not.toBe(0)
})
