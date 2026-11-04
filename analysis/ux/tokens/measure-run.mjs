// Usage: node measure-run.mjs <verbose-all.json> <outDir> <label> [slim.json] [slim-all.json] [text.txt]
// Measures tokens of a run report in several encodings. If the real slim
// outputs (--json, --json --all) are given, they are used; else emulated.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { count } from './count.mjs'
import { toon, compactRun, compactRun2, slimRun } from './formats.mjs'

let [file, outDir, label, slimFile, slimAllFile, textFile] = process.argv.slice(2)
let verboseRaw = readFileSync(file, 'utf8')
let verbose = JSON.parse(verboseRaw)
let slim = slimFile && existsSync(slimFile) ? JSON.parse(readFileSync(slimFile, 'utf8')) : slimRun(verbose, { all: false })
let slimAll = slimAllFile && existsSync(slimAllFile) ? JSON.parse(readFileSync(slimAllFile, 'utf8')) : slimRun(verbose, { all: true })
let actionable = verbose.mutants.filter(m => ['Survived', 'NoCoverage', 'Error'].includes(m.status))
let verboseActionable = { ...verbose, mutants: actionable }
let variants = {
  'json --json (slim, actionable)': slimFile && existsSync(slimFile) ? readFileSync(slimFile, 'utf8') : JSON.stringify(slim),
  'json --json --all (slim)': slimAllFile && existsSync(slimAllFile) ? readFileSync(slimAllFile, 'utf8') : JSON.stringify(slimAll),
  'json --json --verbose --all': verboseRaw,
  'json --json --verbose (actionable)': JSON.stringify(verboseActionable),
  'toon of --json (slim, actionable)': toon(slim),
  'toon of --json --all (slim)': toon(slimAll),
  'toon of --verbose --all': toon(verbose),
  'compact v1 (actionable)': compactRun(slim),
  'compact v2 (actionable, exact texts from verbose)': compactRun2({ ...verboseActionable, runnerVersion: verbose.runnerVersion }),
  'compact v2 --all': compactRun2({ ...verbose }),
}
if (textFile && existsSync(textFile)) variants['text report (non-TTY)'] = readFileSync(textFile, 'utf8')
let rows = []
for (let [name, text] of Object.entries(variants)) {
  rows.push({ name, ...count(text) })
  writeFileSync(`${outDir}/${label}-${name.replace(/[^a-z0-9]+/gi, '_')}.txt`, text)
}
let summary = { label, mutants: verbose.mutants.length, actionable: actionable.length, statuses: verbose.mutants.reduce((a, m) => (a[m.status] = (a[m.status] ?? 0) + 1, a), {}), rows }
writeFileSync(`${outDir}/${label}-measure.json`, JSON.stringify(summary, null, 1))
console.log(JSON.stringify(summary, null, 1))
