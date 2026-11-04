// Compares mootant's verdicts (`mootant run --json --all`) with the physical
// outcomes of project-diff.mjs i3 (raw replacement applied, `vitest related`).
//
// Usage: node compare-verdicts.mjs <i3.json> <mootant-run.json> <out.json>
//
// Detected by mootant: Killed, Timeout. Not detected: Survived, NoCoverage.
// Detected physically: at least one related test failed (or the run broke).

import { readFileSync, writeFileSync } from 'node:fs'

let [i3File, runFile, out] = process.argv.slice(2)
let i3 = JSON.parse(readFileSync(i3File, 'utf8'))
let run = JSON.parse(readFileSync(runFile, 'utf8'))
let verdicts = new Map(run.mutants.map(mutant => [mutant.id, mutant]))
let rows = []
let counts = { compared: 0, agree: 0, falseKilled: 0, falseSurvived: 0, missing: 0, error: 0 }
for (let row of i3.rows) {
  let verdict = verdicts.get(row.id)
  if (!verdict) {
    counts.missing++
    continue
  }
  if (verdict.status === 'Error' || verdict.status === 'Ignored') {
    counts.error++
    continue
  }
  counts.compared++
  let detected = verdict.status === 'Killed' || verdict.status === 'Timeout'
  let physical = row.physicalFailed > 0
  if (detected === physical) {
    counts.agree++
  } else {
    if (detected) counts.falseKilled++
    else counts.falseSurvived++
    rows.push({ id: row.id, file: row.file, line: row.line, mutator: row.mutator, original: row.original, replacement: row.replacement, mootant: verdict.status, cause: verdict.cause ?? null, physicalFailed: row.physicalFailed, switchedFailed: row.switchedFailed })
  }
}
let result = { i3: i3File, run: runFile, counts, disagreements: rows }
writeFileSync(out, JSON.stringify(result, null, 1))
console.log(JSON.stringify(result, null, 1))
