// Builds a static relative-import graph over a checkout and reports, for each
// given directory/file prefix, how many test files import it transitively.
import { readFileSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

let root = process.argv[2]
let targets = process.argv.slice(3)
let files = execFileSync('git', ['-C', root, 'ls-files', 'core', 'cli', 'adapters', 'test', 'types'], { encoding: 'utf8' })
  .split('\n').filter(f => /\.(ts|tsx|mts|js|mjs)$/.test(f) && !f.startsWith('test/fixtures/'))
let set = new Set(files)
let importRe = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g
let deps = new Map()
for (let f of files) {
  let text = readFileSync(path.join(root, f), 'utf8')
  let out = []
  for (let m of text.matchAll(importRe)) {
    let spec = m[1] ?? m[2] ?? m[3]
    if (!spec.startsWith('.')) continue
    let base = path.normalize(path.join(path.dirname(f), spec))
    let candidates = [base, base.replace(/\.js$/, '.ts'), base + '.ts', base + '/index.ts']
    let hit = candidates.find(c => set.has(c))
    if (hit) out.push(hit)
  }
  deps.set(f, out)
}
let rev = new Map()
for (let [f, ds] of deps) for (let d of ds) { if (!rev.has(d)) rev.set(d, []); rev.get(d).push(f) }
function importers(start) {
  let seen = new Set(start), queue = [...start]
  while (queue.length) { let x = queue.pop(); for (let y of rev.get(x) ?? []) if (!seen.has(y)) { seen.add(y); queue.push(y) } }
  return seen
}
for (let t of targets) {
  let start = files.filter(f => f.startsWith(t) && !f.startsWith('test/'))
  let imp = importers(start)
  let tests = [...imp].filter(f => f.startsWith('test/') && f.endsWith('.test.ts'))
  let direct = new Set(start.flatMap(s => rev.get(s) ?? []).filter(f => f.endsWith('.test.ts')))
  console.log(`${t}\tsrc=${start.length}\ttransitiveTests=${tests.length}\tdirectTests=${direct.size}`)
  if (process.env.SHOW) console.log(tests.join('\n'))
}
