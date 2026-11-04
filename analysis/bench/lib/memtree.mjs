#!/usr/bin/env node
// Samples the whole process tree under <pid>: number of processes, the sum of
// their RSS (every tick, from /proc/<p>/statm) and the sum of their PSS (every
// --pss-every ticks, from /proc/<p>/smaps_rollup; shared pages are split, so
// the sum is not inflated by the node binary mapped into every worker).
// GNU time's %M is the peak of the single largest process of the tree, not of
// the tree, so both numbers are needed.
//
// Usage: memtree.mjs <pid> <out.json> [--interval ms] [--pss-every n]
// Stops when <pid> exits (or on SIGTERM) and writes <out.json>.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

let [rootArg, output, ...rest] = process.argv.slice(2)
if (!rootArg || !output) {
  console.error('usage: memtree.mjs <pid> <out.json> [--interval ms] [--pss-every n]')
  process.exit(2)
}
let root = Number(rootArg)
let interval = 1000
let pssEvery = 2
for (let index = 0; index < rest.length; index++) {
  if (rest[index] === '--interval') interval = Number(rest[++index])
  else if (rest[index] === '--pss-every') pssEvery = Number(rest[++index])
}
const PAGE_KB = 4
let cpuStart = process.cpuUsage()
let started = Date.now()
let samples = []
let peak = { rssKb: 0, pssKb: 0, processes: 0, nodeProcesses: 0 }
let tickCount = 0

function read(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function descendants() {
  let children = new Map()
  let names = new Map()
  for (let entry of readdirSync('/proc')) {
    if (entry.charCodeAt(0) < 48 || entry.charCodeAt(0) > 57) continue
    let text = read(`/proc/${entry}/stat`)
    if (text === null) continue
    // pid (comm) state ppid ...; comm may hold spaces and parentheses.
    let close = text.lastIndexOf(')')
    let comm = text.slice(text.indexOf('(') + 1, close)
    let ppid = Number(text.slice(close + 2).split(' ', 2)[1])
    let pid = Number(entry)
    names.set(pid, comm)
    let list = children.get(ppid)
    if (list === undefined) children.set(ppid, (list = []))
    list.push(pid)
  }
  let found = []
  let queue = [root]
  while (queue.length > 0) {
    let pid = queue.pop()
    if (!names.has(pid)) continue
    found.push([pid, names.get(pid)])
    for (let child of children.get(pid) ?? []) queue.push(child)
  }
  return found
}

function tick() {
  tickCount++
  let tree = descendants()
  if (tree.length === 0) return false
  let rssKb = 0
  let pssKb = null
  let nodes = 0
  let withPss = tickCount % pssEvery === 1 || pssEvery === 1
  if (withPss) pssKb = 0
  for (let [pid, comm] of tree) {
    if (comm === 'node' || comm.startsWith('node')) nodes++
    let statm = read(`/proc/${pid}/statm`)
    if (statm !== null) rssKb += Number(statm.split(' ', 2)[1]) * PAGE_KB
    if (withPss) {
      let rollup = read(`/proc/${pid}/smaps_rollup`)
      let match = rollup && /^Pss:\s+(\d+) kB/mu.exec(rollup)
      if (match) pssKb += Number(match[1])
    }
  }
  let t = Date.now() - started
  samples.push([t, tree.length, nodes, rssKb, pssKb])
  peak.rssKb = Math.max(peak.rssKb, rssKb)
  if (pssKb !== null) peak.pssKb = Math.max(peak.pssKb, pssKb)
  peak.processes = Math.max(peak.processes, tree.length)
  peak.nodeProcesses = Math.max(peak.nodeProcesses, nodes)
  return true
}

function finish() {
  clearInterval(timer)
  let cpu = process.cpuUsage(cpuStart)
  writeFileSync(
    output,
    JSON.stringify({
      root,
      interval,
      pssEvery,
      started,
      finished: Date.now(),
      samplerCpuMs: Math.round((cpu.user + cpu.system) / 1000),
      peak,
      columns: ['ms', 'processes', 'nodeProcesses', 'rssKb', 'pssKb'],
      samples,
    }),
  )
  process.exit(0)
}

let timer = setInterval(() => {
  let alive = false
  try {
    process.kill(root, 0)
    alive = true
  } catch {}
  if (!alive) {
    finish()
    return
  }
  tick()
}, interval)
process.on('SIGTERM', finish)
process.on('SIGINT', finish)
tick()
