import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

import { half } from '../src/half'

it('halves', () => {
  expect(half(4)).toBe(2)
})

it('halves the stored value', () => {
  let data = JSON.parse(
    readFileSync(new URL('late.json', import.meta.url), 'utf8'),
  ) as { expected: number; value: number }
  expect(half(data.value)).toBe(data.expected)
})
