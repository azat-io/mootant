// For a section-1 grouping map (file -> target module), classifies how each
// test file is affected: only import paths change, a vi.mock of a moved file
// would mock the subject's own module (mock no longer intercepts), or spies on
// internals; and how many tests lose their own file twin.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
let [root, mapFile] = process.argv.slice(2)
let map = new Map(readFileSync(mapFile, 'utf8').trim().split('\n').slice(1).map(l => l.split('\t')))
let target = f => map.get(f) ?? f
let tests = execFileSync('git', ['-C', root, 'ls-files', 'test'], { encoding: 'utf8' }).split('\n').filter(f => f.endsWith('.test.ts') && !f.startsWith('test/fixtures/'))
let set = new Set(execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).split('\n'))
let resolve = (from, spec) => {
  let base = path.normalize(path.join(path.dirname(from), spec))
  return [base, base.replace(/\.js$/, '.ts'), base + '.ts', base + '/index.ts'].find(c => set.has(c))
}
let stats = { tests: tests.length, untouched: 0, pathOnly: 0, mockSameModule: 0, mockMovedOther: 0, importLinesChanged: 0, testsMerged: 0 }
let examples = []
for (let t of tests) {
  let text = readFileSync(path.join(root, t), 'utf8')
  let mirror = t.replace(/^test\//, '').replace(/(\.[a-z]+)?\.test\.ts$/, '.ts')
  let subject = set.has(mirror) ? mirror : null
  let subjectModule = subject ? target(subject) : null
  let imports = [...text.matchAll(/from\s*['"](\.[^'"]+)['"]/g)].map(m => resolve(t, m[1])).filter(Boolean)
  let mocks = [...text.matchAll(/vi\.(?:mock|doMock)\(\s*import\(\s*['"](\.[^'"]+)['"]\s*\)/g)].map(m => ({ file: resolve(t, m[1]), index: m.index }))
  let movedImports = imports.filter(f => map.has(f))
  let sameModuleMocks = mocks.filter(m => m.file && subjectModule && target(m.file) === subjectModule && m.file !== subject)
  let movedMocks = mocks.filter(m => m.file && map.has(m.file) && !sameModuleMocks.includes(m))
  if (subject && map.has(subject)) stats.testsMerged++
  if (sameModuleMocks.length) {
    stats.mockSameModule++
    for (let m of sameModuleMocks) examples.push(`${t}:${text.slice(0, m.index).split('\n').length} mocks ${m.file} which joins ${subjectModule}`)
  } else if (movedImports.length || movedMocks.length) stats.pathOnly++
  else stats.untouched++
  if (movedMocks.length) stats.mockMovedOther++
  stats.importLinesChanged += movedImports.length + movedMocks.length
}
console.log(JSON.stringify(stats))
console.log(examples.join('\n'))
