import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

let require = createRequire(import.meta.url)

it('requires a CommonJS module through Node', () => {
  expect(require('../lib/word.cjs')).toBe('word')
})
