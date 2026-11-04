import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
let root = process.argv[2]
let tests = execFileSync('git', ['-C', root, 'ls-files', 'test'], { encoding: 'utf8' }).split('\n').filter(f => f.endsWith('.test.ts') && !f.startsWith('test/fixtures/'))
let rows = [], spies = []
for (let t of tests) {
  let text = readFileSync(path.join(root, t), 'utf8')
  let lineOf = i => text.slice(0, i).split('\n').length
  for (let m of text.matchAll(/vi\.(mock|doMock)\(\s*(?:import\(\s*)?['"]([^'"]+)['"]/g)) {
    let spec = m[2]
    let internal = spec.startsWith('.')
    let target = internal ? path.normalize(path.join(path.dirname(t), spec)) : spec
    let mirror = t.replace(/^test\//, '').replace(/(\.[a-z]+)?\.test\.ts$/, '')
    let sameDir = internal && path.dirname(target) === path.dirname(mirror)
    rows.push({ test: t, line: lineOf(m.index), kind: m[1], spec, target, internal, sameDir })
  }
  for (let m of text.matchAll(/vi\.spyOn\(\s*([A-Za-z_$][\w$.]*)\s*,\s*['"]([^'"]+)['"]/g)) {
    spies.push({ test: t, line: lineOf(m.index), object: m[1], method: m[2] })
  }
}
let internal = rows.filter(r => r.internal)
console.log('mock calls', rows.length, 'internal', internal.length, 'files with internal mocks', new Set(internal.map(r => r.test)).size, 'sameDir', internal.filter(r => r.sameDir).length)
let byTarget = {}
for (let r of rows) byTarget[r.target] = (byTarget[r.target] ?? 0) + 1
console.log(Object.entries(byTarget).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'))
console.log('--- spies by object.method')
let byObj = {}
for (let s of spies) byObj[s.object + '.' + s.method] = (byObj[s.object + '.' + s.method] ?? 0) + 1
console.log(Object.entries(byObj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'))
console.log('--- internal mocks list')
for (let r of internal) console.log(`${r.test}:${r.line}\t${r.target}\t${r.sameDir ? 'same-dir' : 'other-dir'}`)
console.log('--- spy list')
for (let s of spies) console.log(`${s.test}:${s.line}\t${s.object}.${s.method}`)
