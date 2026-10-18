import { readFile, writeFile, open, rm } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { render } from '../src/render.js'

// One fixed file per copy of the project, as a test that uses a fixed path,
// port or database: a plain run never runs this test file twice at once.
let name = createHash('sha1')
  .update(import.meta.url)
  .digest('hex')
let output = path.join(tmpdir(), `mootant-render-${name}.txt`)
let lock = path.join(tmpdir(), `mootant-render-${name}.lock`)

test('renders through a fixed file', async () => {
  let handle = await open(lock, 'wx')
  try {
    await writeFile(output, render(2))
    await setTimeout(100)
    assert.equal(await readFile(output, 'utf8'), 'many:4')
  } finally {
    await handle.close()
    await rm(lock)
  }
})

test('renders one', () => {
  assert.equal(render(1), 'one:2')
})
