#!/usr/bin/env node
// Compares status and cause of every mutant across several Mootant reports of
// the same run (e.g. det-1.json det-2.json det-3.json det-c1.json).
//
// Usage: node determinism-compare.mjs <report.json>...
// Prints the number of mutants and every mutant whose status or cause differs.

import fs from 'node:fs'
import path from 'node:path'

let files = process.argv.slice(2)
let reports = files.map(file => {
  let mutants = JSON.parse(fs.readFileSync(file, 'utf8')).mutants
  return new Map(mutants.map(mutant => [mutant.id, `${mutant.status}${mutant.cause ? `(${mutant.cause})` : ''}`]))
})
let ids = new Set(reports.flatMap(report => [...report.keys()]))
let differing = [...ids].filter(id => new Set(reports.map(report => report.get(id))).size > 1)
console.log(`${files.map(file => path.basename(file, '.json')).join(', ')}: ${ids.size} mutants, ${differing.length} differ`)
for (let id of differing) {
  console.log(`  ${id.slice(0, 8)}: ${reports.map(report => report.get(id) ?? '—').join(' | ')}`)
}
