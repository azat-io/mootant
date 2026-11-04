// Crude copy-paste detector: normalized N-line windows that occur in several
// test files (imports, blank and brace-only lines ignored).
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
let root = process.argv[2], N = Number(process.argv[3] ?? 6)
let files = execFileSync('git', ['-C', root, 'ls-files', 'test'], { encoding: 'utf8' }).split('\n').filter(f => f.endsWith('.test.ts') && !f.startsWith('test/fixtures/'))
let windows = new Map()
let coveredLines = 0
for (let f of files) {
  let lines = readFileSync(path.join(root, f), 'utf8').split('\n')
    .map((l, i) => ({ t: l.trim(), i: i + 1 }))
    .filter(x => x.t && !/^(import|\}|\)|\]|\}\)|\}\),?|\]\)|\)\)|\/\*\*|\*|\*\/)/.test(x.t) && !/^[}\])]+[,;)]*$/.test(x.t))
  for (let i = 0; i + N <= lines.length; i++) {
    let key = lines.slice(i, i + N).map(x => x.t).join('\n')
    if (!windows.has(key)) windows.set(key, new Map())
    let m = windows.get(key)
    if (!m.has(f)) m.set(f, lines[i].i)
  }
}
let multi = [...windows].filter(([, m]) => m.size >= 3).sort((a, b) => b[1].size - a[1].size)
console.log('windows of', N, 'lines in >=3 files:', multi.length)
let shown = 0, seenFirst = new Set()
for (let [key, m] of multi) {
  let first = key.split('\n')[0]
  if (seenFirst.has(first)) continue
  seenFirst.add(first)
  console.log(`--- in ${m.size} files, e.g. ${[...m].slice(0, 3).map(([f, l]) => f + ':' + l).join(', ')}`)
  console.log(key.split('\n').map(l => '    ' + l).join('\n'))
  if (++shown >= 12) break
}
