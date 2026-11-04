#!/usr/bin/env node
// Sums agreement matrices of several (oracle, report) pairs.
//
// Usage: node aggregate.mjs <label>=<oracle.jsonl>:<report.json> ...
// Prints one markdown matrix per pair, then the sum per group, where the group
// is the part of the label before the first `/` (e.g. `vitest-default/state`).

import fs from 'node:fs'

let columns = ['killed', 'killed-timeout', 'timeout', 'survived']
let rows = ['Killed', 'Timeout', 'Survived', 'NoCoverage', 'Error']
let groups = new Map()
let lines = []
for (let argument of process.argv.slice(2)) {
  let [label, files] = argument.split('=')
  let [oracleFile, reportFile] = files.split(':')
  let oracle = new Map()
  for (let line of fs.readFileSync(oracleFile, 'utf8').split('\n')) {
    if (line.trim()) {
      let entry = JSON.parse(line)
      oracle.set(entry.id, entry)
    }
  }
  let report = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
  let matrix = createMatrix()
  for (let mutant of report.mutants) {
    let entry = oracle.get(mutant.id)
    if (entry === undefined || mutant.status === 'Ignored' || entry.oracle === 'invalid') {
      continue
    }
    matrix[mutant.status][entry.oracle] += 1
  }
  let group = label.split('/')[0]
  let sum = groups.get(group) ?? createMatrix()
  groups.set(group, sum)
  for (let row of rows) {
    for (let column of columns) {
      sum[row][column] += matrix[row][column]
    }
  }
  lines.push(`\n#### ${label}\n`, ...format(matrix))
}
console.log('## Sums per group')
for (let [group, matrix] of groups) {
  console.log(`\n### ${group}\n`)
  console.log(format(matrix).join('\n'))
}
console.log('\n## Per fixture')
console.log(lines.join('\n'))

function createMatrix() {
  return Object.fromEntries(rows.map(row => [row, Object.fromEntries(columns.map(column => [column, 0]))]))
}

function format(matrix) {
  let out = [`| Mootant \\ эталон | ${columns.join(' | ')} | всего |`, `|---|${columns.map(() => '---:').join('|')}|---:|`]
  let compared = 0
  let agree = 0
  for (let row of rows) {
    let counts = columns.map(column => matrix[row][column])
    let total = counts.reduce((sum, count) => sum + count, 0)
    if (total === 0) {
      continue
    }
    out.push(`| ${row} | ${counts.join(' | ')} | ${total} |`)
    if (row === 'Error') {
      continue
    }
    compared += total
    let detected = matrix[row].killed + matrix[row]['killed-timeout'] + matrix[row].timeout
    agree += row === 'Killed' || row === 'Timeout' ? detected : matrix[row].survived
  }
  out.push('', `Сравнимых (без Error): ${compared}; согласие «обнаружен / не обнаружен»: ${agree} (${compared === 0 ? '—' : ((100 * agree) / compared).toFixed(1)} %), расхождений: ${compared - agree}.`)
  return out
}
