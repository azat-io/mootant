// TOON best case: flatten mutants to uniform rows so TOON uses its tabular form.
import { readFileSync } from 'node:fs'
import { count } from './count.mjs'
import { toon } from './formats.mjs'
let one = s => String(s ?? '').replace(/\n\s*/g, '⏎')
let verbose = JSON.parse(readFileSync(process.argv[2], 'utf8'))
let isRun = verbose.command === 'run'
let mutants = isRun ? verbose.mutants.filter(m => ['Survived', 'NoCoverage', 'Error'].includes(m.status)) : verbose.mutants
let rows = mutants.map(m => ({
  id: m.id, file: m.file, line: m.line, col: m.column, mutator: m.mutator,
  ...(isRun && { status: m.status, tests: m.tests ?? 0, extend: Object.keys(m.testFiles ?? {})[0] ?? '', near: m.test ? `${m.test.file}:${m.test.line ?? ''}` : '' }),
  original: one(m.original), replacement: one(m.replacement),
}))
let flat = { mutants: rows }
let out = [
  ['json of flat rows', JSON.stringify(flat)],
  ['toon tabular (comma)', toon(flat)],
  ['toon tabular (tab)', toon(flat, { delimiter: '\t' })],
].map(([name, t]) => ({ name, ...count(t) }))
console.log(JSON.stringify({ file: process.argv[2], n: rows.length, out }))
console.error(toon(flat).split('\n').slice(0, 4).join('\n'))
