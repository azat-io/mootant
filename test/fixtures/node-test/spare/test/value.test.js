import { writeFileSync, closeSync, fstatSync, openSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'

import { double } from '../src/value.js'

// Writes once per test process what it shows a test.
let directory = process.env.SPARE_JOURNAL

if (directory) {
  let third = 'open'
  try {
    fstatSync(3)
  } catch (error) {
    third = error.code
  }
  let free = openSync(import.meta.filename, 'r')
  closeSync(free)
  let mask = process.umask(0)
  process.umask(mask)
  writeFileSync(
    path.join(directory, `${process.pid}.json`),
    JSON.stringify({
      env: Object.entries(process.env).toSorted(([left], [right]) =>
        left < right ? -1 : 1,
      ),
      connected: process.connected ?? null,
      argv: process.argv.slice(1),
      execArgv: process.execArgv,
      send: typeof process.send,
      cwd: process.cwd(),
      third,
      free,
      mask,
    }),
  )
}

test('doubles', async () => {
  await setTimeout(150)
  assert.equal(double(2), 4)
})
