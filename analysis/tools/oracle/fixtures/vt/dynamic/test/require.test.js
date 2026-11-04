import { createRequire } from 'node:module'
import { expect, test } from 'vitest'

let require = createRequire(import.meta.url)
let { clamp } = require('../src/legacy.cjs')

test('clamp through require', () => {
  expect(clamp(5, 0, 3)).toBe(3)
  expect(clamp(-1, 0, 3)).toBe(0)
})
