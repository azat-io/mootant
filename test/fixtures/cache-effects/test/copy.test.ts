import {
  readdirSync,
  readFileSync,
  mkdtempSync,
  mkdirSync,
  cpSync,
  rmSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { total } from '../src/copy'

it('sums the values of a copy of the fixture', () => {
  let copy = mkdtempSync(path.join(tmpdir(), 'mootant-effects-'))
  cpSync(fileURLToPath(new URL('fx', import.meta.url)), copy, {
    recursive: true,
  })
  let data = JSON.parse(
    readFileSync(path.join(copy, 'values.json'), 'utf8'),
  ) as { values: number[]; total: number }
  rmSync(copy, { recursive: true, force: true })
  let list = fileURLToPath(new URL('list', import.meta.url))
  mkdirSync(list, { recursive: true })
  let names = readdirSync(list)
  expect(total([...data.values, names.length])).toBe(data.total + names.length)
})
