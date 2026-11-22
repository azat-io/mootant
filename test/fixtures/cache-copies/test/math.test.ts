import { readFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs'
import { expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { isAdult } from '../src/math'

it('tells adults by the limits in a copy of the fixture', () => {
  let copy = mkdtempSync(path.join(tmpdir(), 'mootant-copies-'))
  cpSync(path.join(import.meta.dirname, 'fx'), copy, {
    dereference: true,
    recursive: true,
  })
  let linked = Number(readFileSync(path.join(copy, 'link/limits.txt'), 'utf8'))
  let head = Number(readFileSync(path.join(copy, '.git/HEAD'), 'utf8'))
  rmSync(copy, { recursive: true, force: true })
  expect(isAdult(linked)).toBe(true)
  expect(isAdult(head)).toBe(true)
  expect(isAdult(5)).toBe(false)
})
