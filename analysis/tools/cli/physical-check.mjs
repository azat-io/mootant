// Ground truth for a small fixture: applies every listed mutant physically to
// its file, runs the plain test command, and compares the outcome with the
// verdict of `mootant run --json --all --no-cache`.
// usage: node physical-check.mjs <fixture dir> <out.json> <paths...>
//   env TEST_CMD (default "npx vitest --run"), TEST_TIMEOUT ms (default 60000)
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

let [fixture, outFile, ...paths] = process.argv.slice(2)
let bin = path.join(fixture, 'node_modules/mootant/bin/mootant.js')
let testCmd = process.env.TEST_CMD ?? 'npx vitest --run'
let timeout = Number(process.env.TEST_TIMEOUT ?? 60000)
let run = args => {
  let r = spawnSync('node', [bin, ...args], { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 })
  if (!r.stdout) throw new Error(`mootant ${args.join(' ')} failed: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
let listed = run(['list', ...paths, '--json', '--verbose']).mutants
let verdicts = new Map(run(['run', ...paths, '--json', '--all', '--no-cache']).mutants.map(m => [m.id, m.status]))
let results = []
for (let m of listed) {
  let file = path.join(fixture, m.file)
  let original = readFileSync(file, 'utf8')
  let span = original.slice(m.start, m.end)
  let row = { id: m.id, mutator: m.mutator, line: m.line, original: m.original, replacement: m.replacement, mootant: verdicts.get(m.id) ?? null }
  if (span !== m.original) {
    row.physical = `offset-mismatch: file has ${JSON.stringify(span)}`
    results.push(row)
    continue
  }
  writeFileSync(file, original.slice(0, m.start) + m.replacement + original.slice(m.end))
  try {
    let started = Date.now()
    let r = spawnSync('sh', ['-c', testCmd], { cwd: fixture, encoding: 'utf8', timeout, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'] })
    row.ms = Date.now() - started
    row.physical = r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGKILL' ? 'timeout' : r.status === 0 ? 'pass' : 'fail'
  } finally {
    writeFileSync(file, original)
  }
  let killedLike = ['Killed', 'Timeout'].includes(row.mootant)
  let survivedLike = ['Survived', 'NoCoverage'].includes(row.mootant)
  row.agree = row.physical === 'pass' ? survivedLike : row.physical === 'fail' || row.physical === 'timeout' ? killedLike : null
  results.push(row)
}
writeFileSync(outFile, JSON.stringify(results, null, 1))
for (let r of results) console.log(`${r.agree === false ? 'DISAGREE' : r.agree === null ? '??' : 'ok'}\t${r.id.slice(0, 4)}\t${r.mutator}\t${r.line}\t${JSON.stringify(r.original)} -> ${JSON.stringify(r.replacement)}\tmootant=${r.mootant}\tphysical=${r.physical}`)
console.log(`total ${results.length}, disagree ${results.filter(r => r.agree === false).length}`)
