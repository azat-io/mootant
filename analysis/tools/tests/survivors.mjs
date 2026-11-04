// Prints the survivors, timeouts and errors of a `mootant run --json --all --verbose` report.
import { readFileSync } from 'node:fs'
let report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
let statuses = new Set((process.argv[3] ?? 'Survived,Timeout,NoCoverage,Error').split(','))
for (let m of report.mutants.filter(m => statuses.has(m.status)).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)) {
  let files = Object.keys(m.testFiles ?? {}).map(f => f.replace(/^test\//, '')).join(', ')
  console.log(`${m.status}\t${m.file}:${m.line}:${m.column}\t${m.mutator}\t${JSON.stringify(m.original)} -> ${JSON.stringify(m.replacement)}\t[${m.scope}]\t${m.id}\ttests=${m.tests}\t${files}${m.cause ? '\tcause=' + JSON.stringify(m.cause) : ''}${m.message ? '\tmsg=' + JSON.stringify(m.message).slice(0, 150) : ''}`)
}
