import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

import { isAdult } from '../src/math'

let file = fileURLToPath(new URL('../package.json', import.meta.url))

it('tells adults, and writes the package file back as it read it', () => {
  writeFileSync(file, readFileSync(file))
  expect(isAdult(30)).toBe(true)
  expect(isAdult(5)).toBe(false)
})
