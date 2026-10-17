import {
  readdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

import { render } from '../src/golden'

let golden = fileURLToPath(new URL('golden.txt', import.meta.url))
let out = fileURLToPath(new URL('out', import.meta.url))

it('renders as the golden file says, and writes it back', () => {
  let text = readFileSync(golden, 'utf8')
  expect(render(2)).toBe(text.split('\n')[0])
  writeFileSync(`${golden}.${process.pid}`, text)
  renameSync(`${golden}.${process.pid}`, golden)
  let temporary = `${out}/${process.pid}.json`
  writeFileSync(temporary, '{}')
  expect(readdirSync(out)).toContain('keep.txt')
  rmSync(temporary, { force: true })
})
