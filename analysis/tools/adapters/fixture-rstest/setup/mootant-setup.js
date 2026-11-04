// Probe of the in-worker part a mootant Rstest adapter would need: learn the
// test file before it loads, activate a mutant from a plan, track tries.
import { appendFileSync, readFileSync } from 'node:fs'

import { afterEach, beforeEach, expect } from '@rstest/core'

let out = process.env.PROBE_OUT
let plan = JSON.parse(readFileSync(process.env.PROBE_PLAN, 'utf8'))
let testPath = expect.getState().testPath
let runtime = (globalThis.__mootant ??= {
  active: null,
  reached: false,
  hits: 0,
  hit(id) {
    this.hits += 1
    if (this.active === id) {
      this.reached = true
      return true
    }
    return false
  },
})
runtime.active = plan[testPath] ?? null
appendFileSync(out, `${JSON.stringify({ kind: 'setup', pid: process.pid, testPath, active: runtime.active })}\n`)
beforeEach(context => {
  runtime.reached = false
  appendFileSync(out, `${JSON.stringify({ kind: 'open', id: context.task.id, name: context.task.name, pid: process.pid })}\n`)
})
afterEach(context => {
  appendFileSync(out, `${JSON.stringify({ kind: 'close', id: context.task.id, reached: runtime.reached, hits: runtime.hits })}\n`)
})
