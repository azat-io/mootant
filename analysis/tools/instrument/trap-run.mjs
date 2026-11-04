// Differential run of trap modules under mootant's mutant switching.
//
// Usage: node trap-run.mjs <project-root> <out.json> <trap file>... [--preset strict]
//
// Each trap module exports `probe()` (sync or async) returning a JSON-able
// observation object; keys starting with `$` are expected to differ between
// switched and plain code (for example Function.prototype.toString) and are
// compared separately. For every trap file the runner builds:
//   original, switched without runtime, switched with runtime active=null,
//   and for every pending mutant X: switched with active=X and the physically
//   applied mutant (raw replacement text in place of the range).
// Every variant runs in a fresh worker thread (fresh globals and module
// instance), TypeScript stripped with vite's transformWithOxc.
// It reports: (a) original != switched-without-runtime or != active=null;
// (b) active=X != physical X.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'

import { listMutants, groupByFile, importDist, MOOTANT_ROOT, loadVite, applyRaw, read } from './lib.mjs'

let argv = process.argv.slice(2)
let flags = new Map()
let positional = []
for (let index = 0; index < argv.length; index++) {
  if (argv[index].startsWith('--')) {
    flags.set(argv[index].slice(2), argv[index + 1])
    index++
  } else positional.push(argv[index])
}
let [root, out, ...files] = positional
let preset = flags.get('preset') ?? 'strict'
let only = flags.get('only') ?? null
let bin = path.join(MOOTANT_ROOT, 'bin/mootant.js')
let { instrumentFile } = await importDist('core/instrument/instrument-file.js')
let { transformWithOxc } = await loadVite()
let runtimeUrl = pathToFileURL(path.join(MOOTANT_ROOT, 'dist/core/runtime/install-mutant-runtime.js')).href
let work = path.join(process.env.TRAP_WORK ?? path.join(os.tmpdir(), 'trap-run'), String(process.pid))
mkdirSync(work, { recursive: true })

let workerSource = `
import { workerData, parentPort } from 'node:worker_threads'
import { createRequire } from 'node:module'
let { file, active, runtimeUrl, cjs } = workerData
function describe(value, seen = new WeakSet()) {
  if (value instanceof Error) return { $error: value.name + ': ' + value.message }
  if (typeof value === 'function') return { $function: value.name }
  if (typeof value === 'bigint') return { $bigint: String(value) }
  if (typeof value === 'symbol') return { $symbol: String(value) }
  if (value === undefined) return { $undefined: true }
  if (Number.isNaN(value)) return { $nan: true }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return { $cycle: true }
    seen.add(value)
    if (Array.isArray(value)) return value.map(item => describe(item, seen))
    let result = {}
    for (let key of Object.keys(value)) result[key] = describe(value[key], seen)
    return result
  }
  return value
}
try {
  if (active !== undefined) {
    let { installMutantRuntime } = await import(runtimeUrl)
    let runtime = installMutantRuntime()
    runtime.active = active
  } else {
    delete globalThis.__mootant
  }
  let mod = cjs ? createRequire(import.meta.url)(file) : await import(file)
  let probe = mod.probe ?? mod.default?.probe
  let observation = await probe()
  parentPort.postMessage({ ok: true, observation: JSON.stringify(describe(observation)) })
} catch (error) {
  parentPort.postMessage({ ok: false, observation: JSON.stringify({ $load: String(error && error.name) + ': ' + String(error && error.message) }) })
}
`
let workerFile = path.join(work, 'worker.mjs')
writeFileSync(workerFile, workerSource)

let counter = 0
async function runVariant(code, display, active) {
  let cjs = /\.c[jt]s$/u.test(display)
  let extension = cjs ? '.cjs' : '.mjs'
  let file = path.join(work, `v${counter++}-${path.basename(display).replace(/\.[^.]+$/u, '')}${extension}`)
  let js = code
  try {
    let lang = /\.tsx$/u.test(display) ? 'tsx' : /\.[cm]?ts$/u.test(display) ? 'ts' : /\.jsx$/u.test(display) ? 'jsx' : 'js'
    let result = await transformWithOxc(code, display.replace(/\.c?js$/u, '.js'), { lang, sourcemap: false, jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' }, ...(lang.startsWith('ts') && { decorator: { legacy: true } }) })
    js = result.code
  } catch (error) {
    return { ok: false, observation: JSON.stringify({ $transform: String(error.message).split('\n')[0] }) }
  }
  writeFileSync(file, js)
  return new Promise(resolve => {
    let worker = new Worker(workerFile, { workerData: { file: cjs ? file : pathToFileURL(file).href, active, runtimeUrl, cjs } })
    let timer = setTimeout(() => {
      void worker.terminate()
      resolve({ ok: false, observation: JSON.stringify({ $hang: true }) })
    }, 5000)
    worker.once('message', message => {
      clearTimeout(timer)
      void worker.terminate()
      resolve(message)
    })
    worker.once('error', error => {
      clearTimeout(timer)
      resolve({ ok: false, observation: JSON.stringify({ $workerError: String(error.message) }) })
    })
  })
}

/** Splits an observation into the compared part and the `$`-keys part. */
function split(observation) {
  let value = JSON.parse(observation)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { strict: observation, loose: '' }
  let strict = {}
  let loose = {}
  for (let [key, item] of Object.entries(value)) (key.startsWith('$') ? loose : strict)[key] = item
  return { strict: JSON.stringify(strict), loose: JSON.stringify(loose) }
}

let report = listMutants({ cwd: root, paths: files, bin, preset })
let byFile = groupByFile(report.mutants.filter(mutant => mutant.status === 'Pending'))
let results = []
let summary = { files: 0, mutants: 0, aDiffs: 0, bDiffs: 0, bLooseOnly: 0, rawUnparsable: 0 }
for (let display of files) {
  let mutants = byFile.get(display) ?? []
  let source = read(path.join(root, display))
  let switched = instrumentFile({ mutants, source, file: display })
  summary.files++
  let original = await runVariant(source, display, undefined)
  let plain = await runVariant(switched, display, undefined)
  let nullActive = await runVariant(switched, display, null)
  let entry = { file: display, mutants: mutants.length, original: original.observation, a: [], b: [] }
  for (let [label, variant] of [['no-runtime', plain], ['active-null', nullActive]]) {
    let left = split(original.observation)
    let right = split(variant.observation)
    if (left.strict !== right.strict) {
      summary.aDiffs++
      entry.a.push({ label, observation: variant.observation })
    } else if (left.loose !== right.loose) {
      entry.a.push({ label, looseOnly: true, observation: variant.observation })
    }
  }
  for (let mutant of mutants) {
    if (only && !only.split(',').includes(mutant.id)) continue
    summary.mutants++
    let active = await runVariant(switched, display, mutant.id)
    let physical = await runVariant(applyRaw(source, mutant), display, undefined)
    let left = split(physical.observation)
    let right = split(active.observation)
    if (physical.observation.includes('$transform')) summary.rawUnparsable++
    if (left.strict !== right.strict) {
      summary.bDiffs++
      entry.b.push({ id: mutant.id, mutator: mutant.mutator, kind: mutant.kind, original: mutant.original, replacement: mutant.replacement, line: mutant.line, physical: physical.observation, switched: active.observation })
    } else if (left.loose !== right.loose) {
      summary.bLooseOnly++
    }
  }
  results.push(entry)
  console.log(`${display}: ${mutants.length} mutants, a-diffs ${entry.a.filter(x => !x.looseOnly).length}, b-diffs ${entry.b.length}`)
}
writeFileSync(out, JSON.stringify({ summary, results }, null, 1))
console.log(JSON.stringify(summary))
rmSync(work, { recursive: true, force: true })
