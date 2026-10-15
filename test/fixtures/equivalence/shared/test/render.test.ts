import { readFile, writeFile, open, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { render } from '../src/render'

// One fixed file per copy of the project, as a test that uses a fixed path,
// port or database: a plain run never runs this test file twice at once.
let name = createHash('sha1')
  .update(import.meta.url)
  .digest('hex')
let output = path.join(tmpdir(), `mootant-render-${name}.txt`)
let lock = path.join(tmpdir(), `mootant-render-${name}.lock`)

it('renders through a fixed file', async () => {
  let handle = await open(lock, 'wx')
  try {
    await writeFile(output, render(2))
    await new Promise(resolve => {
      setTimeout(resolve, 100)
    })
    expect(await readFile(output, 'utf8')).toBe('many:4')
  } finally {
    await handle.close()
    await rm(lock)
  }
})
