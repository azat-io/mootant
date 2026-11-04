import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'

import { label } from '../src/label.js'

// A fixed path, as tests that share a fixture file, a cache directory or a
// SQLite database do. A plain `vitest run` never runs this file twice at once.
let directory = new URL('../tmp/', import.meta.url)
let file = new URL('shared.txt', directory)

test('round-trips labels through a fixed file', async () => {
  mkdirSync(directory, { recursive: true })
  writeFileSync(file, [0, 1, 3, 7].map(count => label(count)).join(','))
  await new Promise(resolve => setTimeout(resolve, 400))
  expect(readFileSync(file, 'utf8')).toBe('none,one,few,many')
  rmSync(file)
})
