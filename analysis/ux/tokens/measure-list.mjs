// Measures token counts of the dogfood list report in several encodings.
import { readFileSync, writeFileSync } from 'node:fs'
import { count } from './count.mjs'
import { toon, compactList } from './formats.mjs'

let raw = readFileSync(process.argv[2], 'utf8')
let report = JSON.parse(raw)
let outDir = process.argv[3]
let noSkipped = { ...report }
delete noSkipped.skipped
let variants = {
  'json (as printed, list --json --skipped)': raw,
  'json mutants only (list --json)': JSON.stringify(noSkipped),
  'json mutants only, pretty 2sp': JSON.stringify(noSkipped, null, 2),
  'toon mutants only': toon(noSkipped),
  'toon mutants only, tab': toon(noSkipped, { delimiter: '\t' }),
  'toon with skipped': toon(report),
  'compact mutants only': compactList(report),
  'compact with skipped': compactList(report, { skipped: true }),
}
let rows = []
for (let [name, text] of Object.entries(variants)) {
  let t0 = Date.now()
  let c = count(text)
  rows.push({ name, ...c, ms: Date.now() - t0 })
  writeFileSync(`${outDir}/list-${name.replace(/[^a-z0-9]+/gi, '_')}.txt`, text)
  console.error(name, c)
}
let n = report.mutants.length
console.log(JSON.stringify({ mutants: n, skipped: report.skipped?.length ?? 0, rows }, null, 1))
