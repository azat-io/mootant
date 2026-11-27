import { appendFileSync, readFileSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyDiscount } from '../src/price.js'

test('takes a percent off', () => {
  assert.equal(applyDiscount(200, 25), 150)
})

test('rejects more than 100 percent', () => {
  assert.throws(() => applyDiscount(10, 101), RangeError)
})

// Kills the second process that runs this file, whatever mutant is active, as
// something outside the run would: the first one is the dry run. Every process
// adds its pid to the file `KILL_LOG` names.
test('waits', async () => {
  let log = process.env.KILL_LOG
  if (log) {
    appendFileSync(log, `${process.pid}\n`)
    await setTimeout(300)
    let pids = readFileSync(log, 'utf8').split('\n').filter(Boolean)
    if (pids.indexOf(String(process.pid)) === 1) {
      process.kill(process.pid, 'SIGKILL')
    }
  }
  await setTimeout(300)
})
