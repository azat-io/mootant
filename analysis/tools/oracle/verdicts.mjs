#!/usr/bin/env node
// Prints the verdicts of one or more Mootant JSON reports side by side.
//
// Usage: node verdicts.mjs <report.json> [<report2.json> ...] [--oracle results.jsonl]
// One row per mutant (by id): location, change, then the status (and cause)
// in every report, then the oracle outcome when given.

import fs from 'node:fs'
import path from 'node:path'

let files = []
let oracleFile = null
let argv = process.argv.slice(2)
for (let index = 0; index < argv.length; index++) {
  if (argv[index] === '--oracle') {
    oracleFile = argv[++index]
  } else {
    files.push(argv[index])
  }
}
let reports = files.map(file => {
  let text = fs.readFileSync(file, 'utf8')
  try {
    return JSON.parse(text)
  } catch {
    return { mutants: [], error: text.slice(0, 200) }
  }
})
let oracle = new Map()
if (oracleFile !== null) {
  for (let line of fs.readFileSync(oracleFile, 'utf8').split('\n')) {
    if (line.trim()) {
      let entry = JSON.parse(line)
      oracle.set(entry.id, entry)
    }
  }
}
let ids = new Map()
for (let report of reports) {
  for (let mutant of report.mutants ?? []) {
    ids.set(mutant.id, mutant)
  }
}
for (let entry of oracle.values()) {
  if (!ids.has(entry.id)) {
    ids.set(entry.id, entry)
  }
}
let header = ['id', 'where', 'change', ...files.map(file => path.basename(file, '.json'))]
if (oracleFile !== null) {
  header.push('oracle')
}
console.log(`| ${header.join(' | ')} |`)
console.log(`|${header.map(() => '---').join('|')}|`)
let rows = [...ids.values()].toSorted((left, right) =>
  left.file === right.file ? left.start - right.start : left.file < right.file ? -1 : 1,
)
for (let mutant of rows) {
  let cells = [
    `\`${mutant.id.slice(0, 8)}\``,
    `${mutant.file}:${mutant.line}`,
    `\`${short(mutant.original)}\` → \`${short(mutant.replacement)}\``,
  ]
  for (let report of reports) {
    let found = (report.mutants ?? []).find(other => other.id === mutant.id)
    cells.push(found === undefined ? '—' : describe(found))
  }
  if (oracleFile !== null) {
    let found = oracle.get(mutant.id)
    cells.push(found === undefined ? '—' : `${found.oracle}${found.precedence ? ' (paren)' : ''}`)
  }
  console.log(`| ${cells.join(' | ')} |`)
}

function describe(mutant) {
  let parts = [mutant.status]
  if (mutant.cause) {
    parts.push(`(${mutant.cause})`)
  }
  if (mutant.path === 'batch') {
    parts.push('[batch]')
  } else if (mutant.isolatedBecause) {
    parts.push(`[${mutant.isolatedBecause}]`)
  }
  return parts.join(' ')
}

function short(text) {
  let flat = String(text ?? '').replaceAll('\n', '⏎').replaceAll('|', '\\|')
  return flat.length > 40 ? `${flat.slice(0, 37)}...` : flat
}
