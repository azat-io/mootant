import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

import { price } from '../src/price'

let data = JSON.parse(
  readFileSync(new URL('data.json', import.meta.url), 'utf8'),
) as { expected: number; base: number }

it('prices', () => {
  expect(price(data.base)).toBe(data.expected)
})
