const { readFile, writeFile, open, rm } = require('node:fs/promises')
const { setTimeout: sleep } = require('node:timers/promises')
const { createHash } = require('node:crypto')
const { tmpdir } = require('node:os')
const path = require('node:path')

const { render } = require('../src/render')

// One fixed file per copy of the project, as a test that uses a fixed path,
// port or database: a plain run never runs this test file twice at once.
let name = createHash('sha1').update(__dirname).digest('hex')
let output = path.join(tmpdir(), `mootant-jest-render-${name}.txt`)
let lock = path.join(tmpdir(), `mootant-jest-render-${name}.lock`)

test('renders through a fixed file', async () => {
  let handle = await open(lock, 'wx').catch(() => {
    throw new Error('Two runs of this test file overlap.')
  })
  try {
    await writeFile(output, render(2))
    await sleep(100)
    expect(await readFile(output, 'utf8')).toBe('many:4')
  } finally {
    await handle.close()
    await rm(lock)
    await rm(output, { force: true })
  }
})

test('renders one', () => {
  expect(render(1)).toBe('one:2')
})
