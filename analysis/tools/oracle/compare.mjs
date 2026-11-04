#!/usr/bin/env node
// Compares Mootant verdicts with oracle results.
//
// Usage:
//   node compare.mjs --oracle <results.jsonl> [--report <mootant.json>]...
//        [--label name]... [--md]
//
// Without --report the Mootant status stored in the oracle results is used.
// With several --report (e.g. default mode and --fast), one matrix per report.
// Classes of disagreement:
//   false-killed      Mootant Killed,       oracle survived
//   false-timeout     Mootant Timeout,      oracle survived
//   false-survived    Mootant Survived,     oracle killed/timeout
//   false-nocoverage  Mootant NoCoverage,   oracle killed/timeout
//   error             Mootant Error (excluded from the score), oracle any
// `killed-timeout` (a test failed with the runner's own timeout) counts as
// detected, like Mootant's Timeout.

import fs from 'node:fs'

let args = parseArgs(process.argv.slice(2))
let oracle = new Map()
for (let line of fs.readFileSync(args.oracle[0], 'utf8').split('\n')) {
  if (line.trim()) {
    let entry = JSON.parse(line)
    oracle.set(entry.id, entry)
  }
}
let reports = (args.report ?? []).map(file => JSON.parse(fs.readFileSync(file, 'utf8')))
let labels = args.label ?? []
let sets = reports.length === 0 ?
    [{ label: 'stored', statuses: new Map([...oracle.values()].map(entry => [entry.id, { status: entry.mootant, cause: entry.mootantCause }])) }]
  : reports.map((report, index) => ({
      label: labels[index] ?? `report ${index + 1}`,
      statuses: new Map(report.mutants.map(mutant => [mutant.id, mutant])),
    }))

let columns = ['killed', 'killed-timeout', 'timeout', 'survived', 'invalid']
let rows = ['Killed', 'Timeout', 'Survived', 'NoCoverage', 'Error', 'Ignored', 'missing']
let summary = []
for (let set of sets) {
  let matrix = new Map(rows.map(row => [row, new Map(columns.map(column => [column, 0]))]))
  let disagreements = []
  let agree = 0
  let compared = 0
  for (let [id, entry] of oracle) {
    let mutant = set.statuses.get(id)
    let status = mutant?.status ?? 'missing'
    matrix.get(status).set(entry.oracle, matrix.get(status).get(entry.oracle) + 1)
    let detected = entry.oracle === 'killed' || entry.oracle === 'killed-timeout' || entry.oracle === 'timeout'
    let kind = null
    if (status === 'Killed' && !detected) {
      kind = 'false-killed'
    } else if (status === 'Timeout' && !detected) {
      kind = 'false-timeout'
    } else if (status === 'Survived' && detected) {
      kind = 'false-survived'
    } else if (status === 'NoCoverage' && detected) {
      kind = 'false-nocoverage'
    } else if (status === 'Error') {
      kind = 'error'
    }
    if (status !== 'Error' && status !== 'Ignored' && status !== 'missing' && entry.oracle !== 'invalid') {
      compared += 1
      if (kind === null) {
        agree += 1
      }
    }
    if (kind !== null) {
      disagreements.push({
        kind,
        id,
        location: `${entry.file}:${entry.line}`,
        mutator: entry.mutator,
        original: entry.original,
        replacement: entry.replacement,
        mootant: status,
        cause: mutant?.cause ?? null,
        killedBy: mutant?.killedBy ?? null,
        isolatedBecause: mutant?.isolatedBecause ?? null,
        path: mutant?.path ?? null,
        oracle: entry.oracle,
        precedence: entry.precedence,
        failed: entry.failed,
      })
    }
  }
  summary.push({ label: set.label, compared, agree, disagreements: disagreements.length })
  if (args.md) {
    console.log(`\n### ${set.label}\n`)
    console.log(`| Mootant \\ oracle | ${columns.join(' | ')} |`)
    console.log(`|---|${columns.map(() => '---:').join('|')}|`)
    for (let row of rows) {
      let counts = matrix.get(row)
      if ([...counts.values()].some(Boolean)) {
        console.log(`| ${row} | ${columns.map(column => counts.get(column)).join(' | ')} |`)
      }
    }
    console.log(`\nCompared ${compared}, agree ${agree} (${compared ? ((100 * agree) / compared).toFixed(1) : '-'}%), disagree ${compared - agree}.`)
    for (let entry of disagreements) {
      console.log(`- ${entry.kind}: \`${entry.id.slice(0, 8)}\` ${entry.location} ${entry.mutator} \`${entry.original.replaceAll('\n', ' ').slice(0, 60)}\` → \`${entry.replacement.replaceAll('\n', ' ').slice(0, 60)}\`: mootant ${entry.mootant}${entry.cause ? ` (${entry.cause})` : ''}${entry.path ? ` [${entry.path}${entry.isolatedBecause ? `/${entry.isolatedBecause}` : ''}]` : ''}, oracle ${entry.oracle}${entry.failed?.length ? ` (failed: ${entry.failed.slice(0, 2).join('; ')})` : ''}`)
    }
  } else {
    console.log(JSON.stringify({ label: set.label, matrix: Object.fromEntries([...matrix].map(([row, counts]) => [row, Object.fromEntries(counts)])), compared, agree, disagreements }, null, 2))
  }
}
if (args.md) {
  console.log('\n| set | compared | agree | disagree |\n|---|---:|---:|---:|')
  for (let entry of summary) {
    console.log(`| ${entry.label} | ${entry.compared} | ${entry.agree} | ${entry.compared - entry.agree} |`)
  }
}

function parseArgs(list) {
  let parsed = {}
  for (let index = 0; index < list.length; index++) {
    let key = list[index].replace(/^--/u, '')
    if (key === 'md') {
      parsed.md = true
      continue
    }
    parsed[key] = [...(parsed[key] ?? []), list[++index]]
  }
  return parsed
}
