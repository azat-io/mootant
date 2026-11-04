// Saves the results of a verify-mootant-bugs workflow run from its journal and
// prints a short summary per bug.
// Usage: node summarize-verification.mjs <journal.jsonl> <batch-name>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

let [journal, batch] = process.argv.slice(2)
let entries = readFileSync(journal, 'utf8')
  .trim()
  .split('\n')
  .map(line => JSON.parse(line))
let bugs = new Map()
for (let entry of entries) {
  if (entry.type !== 'result' || entry.result === null || typeof entry.result !== 'object') {
    continue
  }
  let { result } = entry
  let bug = bugs.get(result.id) ?? { id: result.id, repro: null, skeptic: null }
  if ('reproduced' in result) {
    bug.repro = result
  } else if ('refuted' in result) {
    bug.skeptic = result
  }
  bugs.set(result.id, bug)
}
let results = [...bugs.values()].toSorted((a, b) =>
  a.id.localeCompare(b.id, 'en', { numeric: true }),
)
let directory = path.resolve(import.meta.dirname, '../data/verification')
mkdirSync(directory, { recursive: true })
writeFileSync(
  path.join(directory, `${batch}.json`),
  `${JSON.stringify(results, null, 2)}\n`,
)
for (let bug of results) {
  let repro = bug.repro ?? {}
  let skeptic = bug.skeptic ?? {}
  console.log(
    `${bug.id} | reproduced=${repro.reproduced} test=${repro.repro_test_fails_for_stated_reason} citations=${repro.citations_ok} | refuted=${skeptic.refuted} severity=${skeptic.severity}`,
  )
  console.log(
    `   skeptic: ${(skeptic.reasons ?? '').replaceAll('\n', ' ').slice(0, 500)}`,
  )
}
