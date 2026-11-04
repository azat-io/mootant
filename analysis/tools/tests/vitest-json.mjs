// Summarizes and compares Vitest JSON reports (--reporter=json) of repeated
// runs: durations per file and per test, statuses, failures with messages.
// Usage: node vitest-json.mjs <root-prefix> <label>=<file.json> [...]
import { readFileSync, writeFileSync } from 'node:fs'
let [prefix, ...pairs] = process.argv.slice(2)
let runs = pairs.map(pair => {
  let [label, file] = pair.split('=')
  let report = JSON.parse(readFileSync(file, 'utf8'))
  let files = report.testResults.map(result => ({
    file: result.name.replace(prefix, ''),
    status: result.status,
    seconds: (result.endTime - result.startTime) / 1000,
    message: result.message || '',
    tests: result.assertionResults.map(test => ({
      name: [...test.ancestorTitles, test.title].join(' > '),
      status: test.status,
      seconds: (test.duration ?? 0) / 1000,
      failure: (test.failureMessages ?? []).join('\n').split('\n')[0].slice(0, 200),
    })),
  }))
  return { label, files, report }
})
let out = {}
for (let run of runs) {
  let tests = run.files.flatMap(file => file.tests.map(test => ({ ...test, file: file.file })))
  let byStatus = {}
  for (let test of tests) byStatus[test.status] = (byStatus[test.status] ?? 0) + 1
  let fileSum = run.files.reduce((sum, file) => sum + file.seconds, 0)
  let testSum = tests.reduce((sum, test) => sum + test.seconds, 0)
  out[run.label] = {
    files: run.files.length,
    tests: tests.length,
    byStatus,
    fileSeconds: +fileSum.toFixed(1),
    testSeconds: +testSum.toFixed(1),
    startTime: run.report.startTime,
    slowFiles: run.files.toSorted((a, b) => b.seconds - a.seconds).slice(0, 25).map(file => [+file.seconds.toFixed(2), file.tests.length, file.file]),
    slowTests: tests.toSorted((a, b) => b.seconds - a.seconds).slice(0, 25).map(test => [+test.seconds.toFixed(2), test.file, test.name.slice(0, 140)]),
    failed: tests.filter(test => test.status === 'failed').map(test => ({ file: test.file, name: test.name, seconds: test.seconds, failure: test.failure })),
    failedFiles: run.files.filter(file => file.message).map(file => ({ file: file.file, message: file.message.slice(0, 300) })),
  }
}
// Flakiness: tests whose status differs between runs.
let statuses = new Map()
for (let run of runs) for (let file of run.files) for (let test of file.tests) {
  let key = `${file.file} > ${test.name}`
  if (!statuses.has(key)) statuses.set(key, {})
  statuses.get(key)[run.label] = test.status
}
out.unstable = [...statuses].filter(([, s]) => new Set(Object.values(s)).size > 1 || Object.keys(s).length < runs.length || Object.values(s).includes('failed')).map(([key, s]) => ({ test: key, ...s }))
console.log(JSON.stringify(out, null, 1))
