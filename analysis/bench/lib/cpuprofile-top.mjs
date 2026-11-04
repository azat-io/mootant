#!/usr/bin/env node
// Summarizes V8 CPU profiles (`node --cpu-prof`): the most expensive functions
// by self time, self time by package or module, and the inclusive time of
// chosen functions (recursion counted once).
//
// Usage: cpuprofile-top.mjs [options] <file.cpuprofile | directory>...
//   --top N           rows per table (default 25)
//   --merge           one summary of all profiles (e.g. every Vitest worker)
//   --focus a,b,c     inclusive time of these functions: a bare name matches
//                     the function name; an entry with a "/" or ending in .js
//                     matches every frame of that module file (Mootant's dist
//                     is minified, but has one exported function per file, so
//                     core/run/run-dry-phase.js stands for runDryPhase)
//   --by package|module   grouping of the second table (default package)
//   --json            machine-readable output
// Groups: (program), (idle), (garbage collector); node:internal/<area>;
// a package from the last node_modules/<name> of the URL (pnpm layouts too);
// mootant/<dir> for Mootant's dist (dist/core/hints -> mootant/core/hints);
// project/<dir> for files outside node_modules; (native) for frames without URL.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let args = process.argv.slice(2)
let top = 25
let merge = false
let json = false
let by = 'package'
let focus = []
let inputs = []
for (let index = 0; index < args.length; index++) {
  let arg = args[index]
  if (arg === '--top') top = Number(args[++index])
  else if (arg === '--merge') merge = true
  else if (arg === '--json') json = true
  else if (arg === '--by') by = args[++index]
  else if (arg === '--focus') focus = args[++index].split(',').filter(Boolean)
  else inputs.push(arg)
}
if (inputs.length === 0) {
  console.error('usage: cpuprofile-top.mjs [--top N] [--merge] [--focus f1,f2] [--by package|module] [--json] <profile|dir>...')
  process.exit(2)
}

let files = inputs.flatMap(input =>
  statSync(input).isDirectory() ?
    readdirSync(input)
      .filter(name => name.endsWith('.cpuprofile'))
      .sort()
      .map(name => path.join(input, name))
  : [input],
)

function toPath(url) {
  if (url.startsWith('file://')) {
    try {
      return fileURLToPath(url)
    } catch {
      return url
    }
  }
  return url
}

export function groupOf(url, functionName, mode = 'package') {
  if (!url) {
    if (functionName.startsWith('(')) return functionName
    return '(native)'
  }
  if (url.startsWith('node:')) {
    let parts = url.slice(5).split('/')
    return parts[0] === 'internal' ? `node:internal/${parts[1] ?? ''}` : `node:${parts[0]}`
  }
  let file = toPath(url).split(path.sep).join('/')
  let at = file.lastIndexOf('/node_modules/')
  if (at !== -1) {
    let rest = file.slice(at + '/node_modules/'.length).split('/')
    let name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]
    let inner = rest.slice(rest[0].startsWith('@') ? 2 : 1)
    if (name === 'mootant' && inner[0] === 'dist') {
      return `mootant/${inner.slice(1, inner.length > 3 ? 3 : 2).join('/')}`
    }
    if (mode === 'module') return `${name}/${inner.join('/')}`
    return name
  }
  if (/\/mootant\/dist\//u.test(file)) {
    let inner = file.slice(file.indexOf('/dist/') + 6).split('/')
    return `mootant/${inner.slice(0, inner.length > 2 ? 2 : 1).join('/')}`
  }
  if (mode === 'module') return `project:${file}`
  let dir = path.posix.dirname(file).split('/').slice(-2).join('/')
  return `project/${dir}`
}

function analyze(profile) {
  let nodes = new Map(profile.nodes.map(node => [node.id, node]))
  let self = new Map()
  let { samples, timeDeltas } = profile
  let elapsed = 0
  for (let index = 0; index < samples.length; index++) {
    let duration =
      index + 1 < timeDeltas.length ? timeDeltas[index + 1] : Math.max(0, profile.endTime - profile.startTime - elapsed)
    elapsed += timeDeltas[index] ?? 0
    self.set(samples[index], (self.get(samples[index]) ?? 0) + duration)
  }
  // Inclusive time per node, then per function at its outermost frame.
  let total = new Map()
  let order = []
  let stack = [profile.nodes[0].id]
  while (stack.length > 0) {
    let id = stack.pop()
    order.push(id)
    for (let child of nodes.get(id).children ?? []) stack.push(child)
  }
  for (let index = order.length - 1; index >= 0; index--) {
    let node = nodes.get(order[index])
    let sum = self.get(node.id) ?? 0
    for (let child of node.children ?? []) sum += total.get(child) ?? 0
    total.set(node.id, sum)
  }
  let key = node => {
    let frame = node.callFrame
    let file = frame.url ? toPath(frame.url) : ''
    return `${frame.functionName || '(anonymous)'}\t${file}:${frame.lineNumber + 1}`
  }
  let functionsSelf = new Map()
  let groupsSelf = new Map()
  for (let [id, time] of self) {
    let node = nodes.get(id)
    let k = key(node)
    functionsSelf.set(k, (functionsSelf.get(k) ?? 0) + time)
    let group = groupOf(node.callFrame.url, node.callFrame.functionName, by)
    groupsSelf.set(group, (groupsSelf.get(group) ?? 0) + time)
  }
  let inclusive = new Map()
  let active = new Map()
  let byName = new Set(focus.filter(entry => !entry.includes('/') && !entry.endsWith('.js')))
  let byFile = focus.filter(entry => !byName.has(entry))
  function focusOf(frame) {
    if (byName.has(frame.functionName)) return frame.functionName
    if (byFile.length === 0 || !frame.url) return null
    let file = toPath(frame.url).split(path.sep).join('/')
    return byFile.find(entry => file.endsWith(`/${entry}`)) ?? null
  }
  function walk(id) {
    let node = nodes.get(id)
    let name = focusOf(node.callFrame)
    let counted = name !== null
    if (counted) {
      if ((active.get(name) ?? 0) === 0) {
        inclusive.set(name, (inclusive.get(name) ?? 0) + total.get(id))
      }
      active.set(name, (active.get(name) ?? 0) + 1)
    }
    for (let child of node.children ?? []) walk(child)
    if (counted) active.set(name, active.get(name) - 1)
  }
  if (focus.length > 0) walk(profile.nodes[0].id)
  return {
    totalUs: total.get(profile.nodes[0].id) ?? 0,
    wallUs: profile.endTime - profile.startTime,
    functionsSelf,
    groupsSelf,
    inclusive,
  }
}

function add(target, source) {
  for (let [k, v] of source) target.set(k, (target.get(k) ?? 0) + v)
}

function rows(map, count) {
  return [...map.entries()].sort((left, right) => right[1] - left[1]).slice(0, count)
}

function ms(us) {
  return (us / 1000).toFixed(1)
}

function print(title, result) {
  let { totalUs } = result
  let share = us => (totalUs > 0 ? `${((us / totalUs) * 100).toFixed(1)}%` : '–')
  console.log(`### ${title}`)
  console.log('')
  console.log(`Sampled ${ms(totalUs)} ms of ${ms(result.wallUs)} ms of profile time.`)
  console.log('')
  console.log(`| # | function | location | self, ms | share |`)
  console.log('|---|---|---|---|---|')
  rows(result.functionsSelf, top).forEach(([k, us], index) => {
    let [name, location] = k.split('\t')
    console.log(`| ${index + 1} | \`${name}\` | ${location.replace(/^.*\/node_modules\//u, 'node_modules/')} | ${ms(us)} | ${share(us)} |`)
  })
  console.log('')
  console.log(`| ${by} | self, ms | share |`)
  console.log('|---|---|---|')
  for (let [group, us] of rows(result.groupsSelf, top)) {
    console.log(`| ${group} | ${ms(us)} | ${share(us)} |`)
  }
  if (result.inclusive.size > 0) {
    console.log('')
    console.log('| function (inclusive) | ms | share |')
    console.log('|---|---|---|')
    for (let name of focus) {
      let us = result.inclusive.get(name) ?? 0
      console.log(`| \`${name}\` | ${ms(us)} | ${share(us)} |`)
    }
  }
  console.log('')
}

let results = files.map(file => [file, analyze(JSON.parse(readFileSync(file, 'utf8')))])
if (json) {
  let plain = result => ({
    totalUs: result.totalUs,
    wallUs: result.wallUs,
    functions: rows(result.functionsSelf, top),
    groups: rows(result.groupsSelf, top),
    inclusive: Object.fromEntries(result.inclusive),
  })
  if (merge) {
    let merged = { totalUs: 0, wallUs: 0, functionsSelf: new Map(), groupsSelf: new Map(), inclusive: new Map() }
    for (let [, result] of results) {
      merged.totalUs += result.totalUs
      merged.wallUs += result.wallUs
      add(merged.functionsSelf, result.functionsSelf)
      add(merged.groupsSelf, result.groupsSelf)
      add(merged.inclusive, result.inclusive)
    }
    console.log(JSON.stringify({ profiles: files.length, ...plain(merged) }, null, 2))
  } else {
    console.log(JSON.stringify(results.map(([file, result]) => ({ file, ...plain(result) })), null, 2))
  }
} else if (merge) {
  let merged = { totalUs: 0, wallUs: 0, functionsSelf: new Map(), groupsSelf: new Map(), inclusive: new Map() }
  for (let [, result] of results) {
    merged.totalUs += result.totalUs
    merged.wallUs += result.wallUs
    add(merged.functionsSelf, result.functionsSelf)
    add(merged.groupsSelf, result.groupsSelf)
    add(merged.inclusive, result.inclusive)
  }
  print(`${files.length} profiles merged`, merged)
} else {
  for (let [file, result] of results) print(path.basename(file), result)
}
