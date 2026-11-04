// TOON tabular with the same information as compact v2 (source line, test name).
import { readFileSync } from 'node:fs'
import { count } from './count.mjs'
import { toon, compactRun2, compactList2 } from './formats.mjs'
let one = s => String(s ?? '').replace(/\n\s*/g, '⏎')
let verbose = JSON.parse(readFileSync(process.argv[2], 'utf8'))
let isRun = verbose.command === 'run'
let mutants = isRun ? verbose.mutants.filter(m => ['Survived', 'NoCoverage', 'Error'].includes(m.status)) : verbose.mutants
let rows = mutants.map(m => ({
  id: m.id, file: m.file, line: m.line, col: m.column, mutator: m.mutator,
  ...(isRun && { status: m.status, tests: m.tests ?? 0, extend: Object.keys(m.testFiles ?? {}).join(' '), near: m.test ? `${m.test.file}:${m.test.line ?? ''} ${m.test.name}` : '' }),
  source: one((m.before ?? [''])[0]),
  original: one(m.original), replacement: one(m.replacement),
}))
let compact = isRun ? compactRun2({ ...verbose, mutants }) : compactList2(verbose)
let out = [
  ['toon tabular, same info as compact v2', toon({ mutants: rows })],
  ['compact v2', compact],
].map(([name, t]) => ({ name, ...count(t) }))
console.log(JSON.stringify({ file: process.argv[2], n: rows.length, out }))
