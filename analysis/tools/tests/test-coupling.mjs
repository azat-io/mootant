// Classifies every test file by what it imports: entry points, module surface
// files (imported from outside their directory), internal helpers (imported
// only from inside their directory) and single-caller helpers.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

let root = process.argv[2]
let outJson = process.argv[3]
let all = execFileSync('git', ['-C', root, 'ls-files', 'core', 'cli', 'adapters', 'test', 'types'], { encoding: 'utf8' })
  .split('\n').filter(f => /\.(ts|tsx|mts|js|mjs)$/.test(f))
let files = all.filter(f => !f.startsWith('test/fixtures/'))
let set = new Set(files)
let importRe = /(?:import|export)\s(?:type\s)?[^'";]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]|vi\.(?:mock|doMock|importActual|importMock)\(\s*['"]([^'"]+)['"]/g
let resolve = (from, spec) => {
  let base = path.normalize(path.join(path.dirname(from), spec))
  return [base, base.replace(/\.js$/, '.ts'), base + '.ts', base + '/index.ts', base.replace(/\.js$/, '.d.ts'), base + '.d.ts'].find(c => set.has(c))
}
let deps = new Map(), typeOnly = new Map()
for (let f of files) {
  let text = readFileSync(path.join(root, f), 'utf8')
  let out = new Set(), types = new Set()
  for (let m of text.matchAll(importRe)) {
    let spec = m[1] ?? m[2] ?? m[3] ?? m[4]
    if (!spec.startsWith('.')) continue
    let hit = resolve(f, spec)
    if (!hit) continue
    if (/^(?:import|export)\s+type\s/.test(m[0])) types.add(hit); else out.add(hit)
  }
  deps.set(f, out); typeOnly.set(f, types)
}
let isSrc = f => /^(core|cli|adapters)\//.test(f)
let entries = new Set(['core/index.ts', 'adapters/vitest/index.ts', 'adapters/node-test/index.ts', 'cli/index.ts', 'core/runtime/index.ts', 'adapters/vitest/runner.ts', 'adapters/node-test/preload/preload.ts', 'adapters/node-test/preload/reporter.ts', 'adapters/node-test/preload/hooks.ts'])
let importers = new Map()
for (let [f, ds] of deps) for (let d of ds) { if (!importers.has(d)) importers.set(d, new Set()); importers.get(d).add(f) }
let classify = src => {
  if (entries.has(src)) return 'entry'
  let imp = [...(importers.get(src) ?? [])].filter(isSrc)
  if (imp.length === 0) return 'test-only'
  let dir = path.dirname(src)
  let outside = imp.filter(i => path.dirname(i) !== dir && !path.dirname(i).startsWith(dir + '/'))
  if (outside.length > 0) return imp.length === 1 ? 'surface-single' : 'surface'
  return imp.length === 1 ? 'internal-single' : 'internal'
}
let srcClass = {}
for (let f of files.filter(isSrc)) srcClass[f] = classify(f)
let counts = {}
for (let c of Object.values(srcClass)) counts[c] = (counts[c] ?? 0) + 1
console.log('source files by class', counts)
let tests = files.filter(f => f.startsWith('test/') && f.endsWith('.test.ts'))
let rows = []
for (let t of tests) {
  let text = readFileSync(path.join(root, t), 'utf8')
  let lines = text.split('\n').length
  let mirror = t.replace(/^test\//, '').replace(/(\.[a-z]+)?\.test\.ts$/, '.ts')
  let srcDeps = [...deps.get(t)].filter(isSrc)
  let subject = set.has(mirror) ? mirror : null
  let cls = subject ? srcClass[subject] : 'no-mirror'
  rows.push({ test: t, lines, subject, cls, srcImports: srcDeps.length, srcDeps })
}
let agg = {}
for (let r of rows) { let a = agg[r.cls] ??= { files: 0, lines: 0 }; a.files++; a.lines += r.lines }
console.log('test files by subject class', agg)
let multi = rows.filter(r => r.srcImports > 1)
console.log('tests importing >1 source file:', multi.length, 'of', rows.length)
let hist = {}
for (let r of rows) hist[r.srcImports] = (hist[r.srcImports] ?? 0) + 1
console.log('histogram of #source imports per test', hist)
// per top-level module dir
let perDir = {}
for (let r of rows) {
  let d = (r.subject ?? r.test.replace(/^test\//, '')).split('/').slice(0, 2).join('/')
  let p = perDir[d] ??= { files: 0, lines: 0, internal: 0, internalLines: 0 }
  p.files++; p.lines += r.lines
  if (r.cls.startsWith('internal')) { p.internal++; p.internalLines += r.lines }
}
console.log('per dir', JSON.stringify(perDir))
if (outJson) {
  let fs = await import('node:fs')
  fs.writeFileSync(outJson, JSON.stringify({ srcClass, rows }, null, 1))
}
