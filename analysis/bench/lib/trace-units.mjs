#!/usr/bin/env node
// Passive tracer of Mootant's Vitest work directory: records when every unit
// of every run of the test runner was claimed, started and finished, so the
// rounds can be checked for idle workers and serialized test files later
// (units-report.mjs). It never writes into the work directory.
//
// Usage: trace-units.mjs <tmpdir> <out.json> [--interval ms] [--pid pid]
//
// <tmpdir> is the TMPDIR of the mootant process, so the work directory is
// <tmpdir>/mootant-XXXXXX (core/run/create-work-directory.ts:27). Every run of
// the test runner resets the folders beat, claim, done, env, out, plan and
// worker (adapters/vitest/reset-run-directory.ts), so a new inode of `plan`
// marks a new run ("round"). Per unit `<hash>-<index>`:
//   claim  mtime of claim/<name>: a worker claimed it, before waitForTurn
//          (adapters/vitest/worker/claim-unit.ts, runner.ts:534-540)
//   start  birth time of out/<name>.jsonl, opened after waitForTurn
//          (runner.ts:541-543)
//   done   mtime of done/<name>, written after the end record (runner.ts:943)
// and, from the end record, booted/loadDuration/duration (runner.ts:922-938).
// The dry run has no plan or claim files; its out files are <hash>-<pid>.
// Stops when --pid exits (or on SIGTERM/SIGINT) and writes <out.json>.
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  openSync,
  readSync,
  closeSync,
  fstatSync,
} from 'node:fs'
import path from 'node:path'

let [tmpdir, output, ...rest] = process.argv.slice(2)
if (!tmpdir || !output) {
  console.error('usage: trace-units.mjs <tmpdir> <out.json> [--interval ms] [--pid pid]')
  process.exit(2)
}
let interval = 100
let watchedPid = null
for (let index = 0; index < rest.length; index++) {
  if (rest[index] === '--interval') interval = Number(rest[++index])
  else if (rest[index] === '--pid') watchedPid = Number(rest[++index])
}

let cpuStart = process.cpuUsage()
let started = Date.now()
/** @type {Map<string, {dir: string, rounds: object[], current: object | null}>} */
let works = new Map()
let ticks = 0
let tickMs = 0

function list(folder) {
  try {
    return readdirSync(folder)
  } catch {
    return null
  }
}

function stat(file) {
  try {
    return statSync(file)
  } catch {
    return null
  }
}

// Last JSON line of a file, read from its end, so big dry-run files are never
// read whole.
function readLastRecord(file) {
  let descriptor
  try {
    descriptor = openSync(file, 'r')
  } catch {
    return null
  }
  try {
    let size = fstatSync(descriptor).size
    let chunk = 65_536
    while (true) {
      let length = Math.min(size, chunk)
      let buffer = Buffer.alloc(length)
      readSync(descriptor, buffer, 0, length, size - length)
      let text = buffer.toString('utf8').replace(/\n+$/u, '')
      let cut = text.lastIndexOf('\n')
      if (cut !== -1 || length === size) {
        try {
          return JSON.parse(text.slice(cut + 1))
        } catch {
          return null
        }
      }
      chunk *= 4
    }
  } finally {
    closeSync(descriptor)
  }
}

// Test records of a small out file (isolated and batch units).
function readTests(file) {
  let tests = 0
  let tried = 0
  let tries = 0
  try {
    for (let line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.startsWith('{"')) continue
      let record = JSON.parse(line)
      if (record.kind === 'test') {
        tests++
        for (let facts of record.tries) {
          tries++
          tried += facts.duration ?? 0
        }
      }
    }
  } catch {
    return null
  }
  return { tests, tries, tried }
}

function newRound(key, dir) {
  let planStat = stat(path.join(dir, 'plan'))
  return {
    key,
    seen: Date.now(),
    planTime: planStat?.mtimeMs ?? null,
    kind: null,
    files: {},
    units: {},
  }
}

function scan(work) {
  let { dir } = work
  let planStat = stat(path.join(dir, 'plan'))
  if (planStat === null) return
  // rm + mkdir may reuse the inode number, so the birth time is part of the key.
  let key = `${planStat.ino}:${planStat.birthtimeMs}`
  let round = work.current
  if (round === null || round.key !== key) {
    round = newRound(key, dir)
    work.rounds.push(round)
    work.current = round
  }
  round.planTime = Math.max(round.planTime ?? 0, planStat.mtimeMs)
  let plans = list(path.join(dir, 'plan')) ?? []
  for (let name of plans) {
    let hash = name.replace(/\.json$/u, '')
    if (round.files[hash] !== undefined) continue
    try {
      let plan = JSON.parse(readFileSync(path.join(dir, 'plan', name), 'utf8'))
      let first = plan.units[0] ?? {}
      round.kind ??= 'mutant' in first ? 'isolated' : 'batch'
      round.files[hash] = {
        file: first.file ?? null,
        units: plan.units.map(unit => ({
          mutant: unit.mutant ?? null,
          mutants: unit.tests ? unit.tests.length : null,
        })),
      }
    } catch {
      // Being written; read it on the next tick.
    }
  }
  for (let name of list(path.join(dir, 'claim')) ?? []) {
    let unit = (round.units[name] ??= { name })
    if (unit.claim === undefined) {
      let claimed = stat(path.join(dir, 'claim', name))
      if (claimed !== null) {
        unit.claim = claimed.mtimeMs
        try {
          unit.pid = Number(readFileSync(path.join(dir, 'claim', name), 'utf8'))
        } catch {}
      }
    }
  }
  for (let name of list(path.join(dir, 'out')) ?? []) {
    let unitName = name.replace(/\.jsonl$/u, '')
    let unit = (round.units[unitName] ??= { name: unitName })
    if (unit.start === undefined) {
      let opened = stat(path.join(dir, 'out', name))
      if (opened !== null) unit.start = opened.birthtimeMs || opened.ctimeMs
    }
  }
  for (let name of list(path.join(dir, 'done')) ?? []) {
    let unit = (round.units[name] ??= { name })
    if (unit.done !== undefined) continue
    let finished = stat(path.join(dir, 'done', name))
    if (finished === null) continue
    unit.done = finished.mtimeMs
    let file = path.join(dir, 'out', `${name}.jsonl`)
    let end = readLastRecord(file)
    if (end?.kind === 'end') {
      unit.booted = end.booted
      unit.loadDuration = end.loadDuration
      unit.duration = end.duration
      unit.reached = end.reached
      unit.hookError = end.hookError !== null
      unit.loadError = end.loadError !== null
    }
    if (round.kind !== null) {
      let tests = readTests(file)
      if (tests !== null) Object.assign(unit, tests)
    }
  }
}

function tick() {
  let from = performance.now()
  ticks++
  for (let name of list(tmpdir) ?? []) {
    if (!name.startsWith('mootant-')) continue
    let dir = path.join(tmpdir, name)
    if (!works.has(dir)) works.set(dir, { dir, rounds: [], current: null })
  }
  for (let work of works.values()) {
    try {
      scan(work)
    } catch (error) {
      work.errors = (work.errors ?? 0) + 1
    }
  }
  tickMs += performance.now() - from
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function finish() {
  clearInterval(timer)
  let cpu = process.cpuUsage(cpuStart)
  let result = {
    tmpdir,
    interval,
    started,
    finished: Date.now(),
    ticks,
    tickMs: Math.round(tickMs),
    tracerCpuMs: Math.round((cpu.user + cpu.system) / 1000),
    works: [...works.values()].map(work => ({
      dir: work.dir,
      errors: work.errors ?? 0,
      rounds: work.rounds.map(round => ({
        ...round,
        kind: round.kind ?? 'dry',
        units: Object.values(round.units),
      })),
    })),
  }
  writeFileSync(output, JSON.stringify(result))
  process.exit(0)
}

let timer = setInterval(() => {
  tick()
  if (watchedPid !== null && !alive(watchedPid)) finish()
}, interval)
process.on('SIGTERM', finish)
process.on('SIGINT', finish)
