// Splits lines of test files (and, for comparison, source files) into kinds.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
let root = process.argv[2]
let ls = (...a) => execFileSync('git', ['-C', root, 'ls-files', ...a], { encoding: 'utf8' }).split('\n').filter(Boolean)
let groups = {
  tests: ls('test').filter(f => f.endsWith('.test.ts') && !f.startsWith('test/fixtures/')),
  helpers: ls('test/helpers').filter(f => f.endsWith('.ts')),
  src: ls('core', 'cli', 'adapters').filter(f => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts')),
}
for (let [name, files] of Object.entries(groups)) {
  let k = { total: 0, blank: 0, jsdoc: 0, lineComment: 0, import: 0, testDecl: 0, expect: 0, other: 0 }
  let jsdocBlocks = 0, testCount = 0
  for (let f of files) {
    let text = readFileSync(path.join(root, f), 'utf8')
    let inBlock = false, inImport = false
    for (let line of text.split('\n')) {
      k.total++
      let t = line.trim()
      if (inBlock) { k.jsdoc++; if (t.includes('*/')) inBlock = false; continue }
      if (t.startsWith('/*')) { k.jsdoc++; jsdocBlocks++; if (!t.includes('*/')) inBlock = true; continue }
      if (t === '') { k.blank++; continue }
      if (t.startsWith('//')) { k.lineComment++; continue }
      if (inImport) { k.import++; if (/from\s+['"]/.test(t) || t.endsWith("'") ) inImport = false; continue }
      if (/^import\s/.test(t)) { k.import++; if (!/from\s+['"]|^import\s+['"]/.test(t)) inImport = true; continue }
      if (/^(it|test|describe)(\.each|\.skipIf|\.runIf)?[\s(<`]/.test(t)) { k.testDecl++; if (!t.startsWith('describe')) testCount++; continue }
      if (/^(await\s+)?expect[.(]/.test(t)) { k.expect++; continue }
      k.other++
    }
  }
  let pct = x => (100 * x / k.total).toFixed(1) + '%'
  console.log(name, 'files', files.length, JSON.stringify(k), 'jsdocBlocks', jsdocBlocks, Object.fromEntries(Object.entries(k).map(([a, b]) => [a, pct(b)])))
}
