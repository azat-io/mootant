import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import path from 'node:path'

import { isAdult } from '../src/math'

let limits = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, '../../../fixtures/limits.json'),
    'utf8',
  ),
) as { age: number }

it('tells adults', () => {
  expect(isAdult(limits.age)).toBe(true)
  expect(isAdult(5)).toBe(false)
})
