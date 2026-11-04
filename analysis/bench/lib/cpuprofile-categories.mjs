#!/usr/bin/env node
// CPU of a group of .cpuprofile files (one process, or many merged: the
// workers of a run) split into categories by self time, plus the inclusive
// time of a few functions. This is the breakdown of analysis/04-performance.md,
// 4.5.6; cpuprofile-top.mjs gives the plain per-package and per-function tops.
//
// Usage: node cpuprofile-categories.mjs <directory with *.cpuprofile>
//   e.g. $BENCH_RESULTS/profiles/path-to-regexp/run/workers
//
// Shares are of non-idle CPU. The categories add up to 100 %; the inclusive
// time of a function counts its outermost frame only and overlaps the
// categories (findTestFileStackTrace is partly "vitest", partly "loading").
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const FOCUS = [
  'findTestFileStackTrace', // Vitest: the place of every test (includeTaskLocation)
  'collect', // Vitest: collection of a test file
  'runTask', // Vitest: one test
  'require', // CJS loading with module execution
  'loadCJSModuleWithModuleLoad',
  'wrapSafe', // CJS compilation
  'compileSourceTextModule', // ESM compilation
  'getModuleJobForImport', // ESM loading
  'verify', // ESLint Linter#verify (perfectionist)
  'parseForESLint', // typescript-eslint parser (perfectionist)
]

function category({ functionName: fn, url }) {
  if (!url) {
    if (fn === '(idle)') return 'idle'
    if (fn === '(garbage collector)') return 'gc'
    if (fn === '(program)') return 'program'
    if (/compile|Compile/.test(fn)) return 'loading'
    return 'native-other'
  }
  if (
    url.startsWith('node:internal/modules') ||
    url.startsWith('node:internal/bootstrap') ||
    url.startsWith('node:vm')
  ) {
    return 'loading'
  }
  if (
    url.includes('/vite/dist/node/module-runner.js') ||
    url.includes('/vitest/dist/module-evaluator.js')
  ) {
    return /StackTrace|CallSite|stackTrace|callSite/.test(fn) ? 'stack-traces' : 'loading'
  }
  if (url.includes('/vitest/dist/chunks/source-map')) return 'stack-traces'
  if (url.includes('/node_modules/mootant/')) return 'mootant'
  if (
    url.includes('/node_modules/vitest/') ||
    url.includes('/node_modules/@vitest/') ||
    url.includes('/node_modules/tinypool')
  ) {
    return 'vitest'
  }
  if (url.includes('/node_modules/vite/') || url.includes('/node_modules/rolldown/')) return 'vite'
  if (url.startsWith('node:internal/child_process') || url.startsWith('node:child_process')) {
    return 'ipc'
  }
  if (url.startsWith('node:')) return 'node-other'
  return 'tests+project'
}

const [dir] = process.argv.slice(2)
if (!dir) {
  console.error('usage: node cpuprofile-categories.mjs <directory with *.cpuprofile>')
  process.exit(2)
}
const files = readdirSync(dir)
  .filter(name => name.endsWith('.cpuprofile'))
  .map(name => path.join(dir, name))
const categories = new Map()
const inclusive = new Map()
let total = 0 // microseconds

for (const file of files) {
  const profile = JSON.parse(readFileSync(file, 'utf8'))
  const nodes = new Map(profile.nodes.map(node => [node.id, node]))
  const self = new Map()
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i]
    self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i + 1] ?? 0))
  }
  for (const [id, time] of self) {
    const name = category(nodes.get(id).callFrame)
    categories.set(name, (categories.get(name) ?? 0) + time)
    total += time
  }
  // Inclusive time of every node, children first.
  const order = []
  const stack = [profile.nodes[0].id]
  while (stack.length > 0) {
    const id = stack.pop()
    order.push(id)
    for (const child of nodes.get(id).children ?? []) stack.push(child)
  }
  const subtree = new Map()
  for (let i = order.length - 1; i >= 0; i--) {
    const node = nodes.get(order[i])
    let time = self.get(node.id) ?? 0
    for (const child of node.children ?? []) time += subtree.get(child) ?? 0
    subtree.set(node.id, time)
  }
  // Outermost frames of the focus functions only, so recursion counts once.
  const active = new Map()
  const walk = id => {
    const node = nodes.get(id)
    const name = node.callFrame.functionName
    const focus = FOCUS.includes(name)
    if (focus && (active.get(name) ?? 0) === 0) {
      inclusive.set(name, (inclusive.get(name) ?? 0) + subtree.get(id))
    }
    if (focus) active.set(name, (active.get(name) ?? 0) + 1)
    for (const child of node.children ?? []) walk(child)
    if (focus) active.set(name, active.get(name) - 1)
  }
  walk(profile.nodes[0].id)
}

const seconds = us => (us / 1e6).toFixed(2).padStart(8)
const idle = categories.get('idle') ?? 0
const busy = total - idle
const share = us => `${((100 * us) / busy).toFixed(1).padStart(5)} %`
console.log(
  `${files.length} profiles; sampled ${seconds(total).trim()} s; ` +
    `idle ${seconds(idle).trim()} s (${((100 * idle) / total).toFixed(0)} %); ` +
    `non-idle ${seconds(busy).trim()} s`,
)
console.log('self time by category, share of non-idle:')
for (const [name, time] of [...categories].sort((a, b) => b[1] - a[1])) {
  if (name !== 'idle') console.log(`  ${name.padEnd(14)} ${seconds(time)} s ${share(time)}`)
}
console.log('inclusive, share of non-idle:')
for (const name of FOCUS) {
  if (inclusive.has(name)) {
    console.log(`  ${name.padEnd(28)} ${seconds(inclusive.get(name))} s ${share(inclusive.get(name))}`)
  }
}
