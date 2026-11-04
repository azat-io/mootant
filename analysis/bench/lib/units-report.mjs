#!/usr/bin/env node
// Reads a trace of trace-units.mjs and measures every run of the test runner
// ("round"): how long it took, how busy the W worker slots were, how long
// claimed units waited for the unit before them of the same test file
// (waitForTurn, adapters/vitest/worker/wait-for-turn.ts), how long the round
// ran with fewer than W units at once at its end (tail) and how long the
// longest serial chain of one test file was. For every unit it splits the
// worker's own time into loading (collect: importing the test file and what it
// imports, transforms included) and tests (the tries of its tests).
//
// Usage: units-report.mjs <run-k.units.json> [--workers 3] [--json]
// As a module: analyzeTrace(trace, workers) -> { rounds, totals }.
import { readFileSync } from 'node:fs'

function sum(values) {
  let total = 0
  for (let value of values) total += value
  return total
}

function analyzeRound(round, workers) {
  let units = round.units.filter(unit => unit.done !== undefined)
  let started = units.filter(unit => unit.start !== undefined)
  if (units.length === 0) return null
  let firstStart = Math.min(...started.map(unit => unit.start))
  let t0 =
    round.kind === 'dry' ? firstStart : Math.min(round.planTime ?? Infinity, firstStart)
  let end = Math.max(...units.map(unit => unit.done))
  let wall = end - t0
  let busy = sum(started.map(unit => unit.done - unit.start))
  let waiting = sum(
    started
      .filter(unit => unit.claim !== undefined)
      .map(unit => Math.max(0, unit.start - unit.claim)),
  )
  // Units running over time, for the share of the round at each level and the
  // tail: the time after the last moment all W slots ran a unit.
  let events = []
  for (let unit of started) {
    events.push([unit.start, 1], [unit.done, -1])
  }
  events.sort((left, right) => left[0] - right[0] || left[1] - right[1])
  let levels = new Array(workers + 2).fill(0)
  let running = 0
  let last = t0
  let lastFull = null
  for (let [time, delta] of events) {
    levels[Math.min(running, workers + 1)] += time - last
    if (running >= workers && delta < 0) lastFull = time
    running += delta
    last = time
  }
  let tail = lastFull === null ? wall : end - lastFull
  // Units of one test file never overlap; the longest chain bounds the round.
  let chains = new Map()
  for (let unit of started) {
    let hash = unit.name.slice(0, unit.name.lastIndexOf('-'))
    let chain = chains.get(hash) ?? { from: Infinity, to: 0, units: 0, busy: 0 }
    chain.from = Math.min(chain.from, unit.claim ?? unit.start)
    chain.to = Math.max(chain.to, unit.done)
    chain.units++
    chain.busy += unit.done - unit.start
    chains.set(hash, chain)
  }
  let longest = [...chains.entries()].sort(
    (left, right) => right[1].to - right[1].from - (left[1].to - left[1].from),
  )[0]
  let longestFile = longest ? (round.files?.[longest[0]]?.file ?? longest[0]) : null
  let load = sum(units.map(unit => unit.loadDuration ?? 0))
  let duration = sum(units.map(unit => unit.duration ?? 0))
  let tried = sum(units.map(unit => unit.tried ?? 0))
  return {
    kind: round.kind,
    units: units.length,
    testFiles: chains.size,
    wallMs: Math.round(wall),
    busyShare: wall > 0 ? busy / (workers * wall) : null,
    waitShare: wall > 0 ? waiting / (workers * wall) : null,
    tailMs: Math.round(tail),
    levelShares: levels.map(time => (wall > 0 ? time / wall : null)),
    longestChainMs: longest ? Math.round(longest[1].to - longest[1].from) : 0,
    longestChainUnits: longest ? longest[1].units : 0,
    longestChainFile: longestFile,
    unitMs: {
      mean: units.length ? duration / units.length : null,
      load: units.length ? load / units.length : null,
      tests: units.length && round.kind !== 'dry' ? tried / units.length : null,
    },
    sums: { busy, waiting, load, duration, tried },
  }
}

export function analyzeTrace(trace, workers = 3) {
  let rounds = []
  for (let work of trace.works) {
    for (let round of work.rounds) {
      let analyzed = analyzeRound(round, workers)
      if (analyzed !== null) rounds.push(analyzed)
    }
  }
  let mutantRounds = rounds.filter(round => round.kind !== 'dry')
  let wall = sum(mutantRounds.map(round => round.wallMs))
  let busy = sum(mutantRounds.map(round => round.sums.busy))
  let waiting = sum(mutantRounds.map(round => round.sums.waiting))
  let tail = sum(mutantRounds.map(round => round.tailMs))
  let units = sum(mutantRounds.map(round => round.units))
  let dry = rounds.filter(round => round.kind === 'dry')
  return {
    rounds,
    totals: {
      dryRuns: dry.length,
      dryWallMs: sum(dry.map(round => round.wallMs)),
      dryLoadShare:
        sum(dry.map(round => round.sums.duration)) > 0 ?
          sum(dry.map(round => round.sums.load)) / sum(dry.map(round => round.sums.duration))
        : null,
      rounds: mutantRounds.length,
      units,
      roundWallMs: wall,
      busyShare: wall > 0 ? busy / (workers * wall) : null,
      waitShare: wall > 0 ? waiting / (workers * wall) : null,
      tailShare: wall > 0 ? tail / wall : null,
      unitLoadMs: units ? sum(mutantRounds.map(round => round.sums.load)) / units : null,
      unitTestsMs: units ? sum(mutantRounds.map(round => round.sums.tried)) / units : null,
      unitMs: units ? sum(mutantRounds.map(round => round.sums.duration)) / units : null,
      tracerCpuMs: trace.tracerCpuMs,
    },
  }
}

function percent(value) {
  return value === null || value === undefined ? '–' : `${(value * 100).toFixed(0)}%`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let [file, ...rest] = process.argv.slice(2)
  if (!file) {
    console.error('usage: units-report.mjs <run-k.units.json> [--workers 3] [--json]')
    process.exit(2)
  }
  let workers = 3
  let json = false
  for (let index = 0; index < rest.length; index++) {
    if (rest[index] === '--workers') workers = Number(rest[++index])
    else if (rest[index] === '--json') json = true
  }
  let result = analyzeTrace(JSON.parse(readFileSync(file, 'utf8')), workers)
  if (json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log('| # | kind | units | test files | wall, s | busy | waiting | tail, s | longest chain, s (units) | load / unit, ms | tests / unit, ms |')
    console.log('|---|---|---|---|---|---|---|---|---|---|---|')
    result.rounds.forEach((round, index) => {
      console.log(
        `| ${index + 1} | ${round.kind} | ${round.units} | ${round.testFiles} | ${(round.wallMs / 1000).toFixed(1)} | ${percent(round.busyShare)} | ${percent(round.waitShare)} | ${(round.tailMs / 1000).toFixed(1)} | ${(round.longestChainMs / 1000).toFixed(1)} (${round.longestChainUnits}) | ${round.unitMs.load?.toFixed(0) ?? '–'} | ${round.unitMs.tests?.toFixed(0) ?? '–'} |`,
      )
    })
    let t = result.totals
    console.log(
      `\nmutant rounds: ${t.rounds}, units ${t.units}, wall ${(t.roundWallMs / 1000).toFixed(1)} s, busy ${percent(t.busyShare)}, waiting ${percent(t.waitShare)}, tail ${percent(t.tailShare)}; dry runs ${t.dryRuns} (${(t.dryWallMs / 1000).toFixed(1)} s, load share ${percent(t.dryLoadShare)}); tracer CPU ${t.tracerCpuMs} ms`,
    )
  }
}
