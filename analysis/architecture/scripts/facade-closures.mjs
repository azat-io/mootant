// Transitive closure of each mutator counting the dependencies hidden behind
// the `context.syntax` facade: a call `.isLoopTest(` in a file of the closure
// adds core/syntax/is-loop-test.ts (or the core/tree file of the same name)
// and its own imports. Import edges alone miss them.
//
// Usage: node analysis/architecture/scripts/facade-closures.mjs analysis/architecture/data
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

let [dataDir] = process.argv.slice(2)
let graph = JSON.parse(readFileSync(path.join(dataDir, 'depcruise.json'), 'utf8'))
let byFile = new Map(graph.modules.map(m => [m.source, m]))
let style = new Map(
  readFileSync(path.join(dataDir, 'style-files.tsv'), 'utf8').trim().split('\n').slice(1)
    .map(l => l.split('\t')).map(c => [c[0], +c[8]]),
)
let methods = [...readFileSync('types/syntax/syntax-helpers.d.ts', 'utf8').matchAll(/^ {2}([a-zA-Z]+)[(:]/gmu)].map(m => m[1])
let kebab = name => name.replaceAll(/[A-Z]/gu, c => `-${c.toLowerCase()}`)
let implOf = new Map()
for (let method of methods) {
  let file = [`core/syntax/${kebab(method)}.ts`, `core/tree/${kebab(method)}.ts`, `core/regex/${kebab(method)}.ts`].find(existsSync)
  if (file) implOf.set(method, file)
}
function closure(start, viaFacade) {
  let seen = new Set()
  let stack = [start]
  while (stack.length > 0) {
    let file = stack.pop()
    if (seen.has(file)) continue
    seen.add(file)
    for (let dep of byFile.get(file)?.dependencies ?? []) {
      if (/^(core|adapters|cli)\//u.test(dep.resolved) && !dep.dependencyTypes.includes('type-only')) stack.push(dep.resolved)
    }
    if (viaFacade && file.startsWith('core/mutators/')) {
      let text = readFileSync(file, 'utf8')
      for (let [method, impl] of implOf) {
        if (new RegExp(`\\.${method}\\b`, 'u').test(text)) stack.push(impl)
      }
    }
  }
  seen.delete(start)
  return seen
}
let rows = []
for (let m of graph.modules.map(x => x.source).filter(f => /^core\/mutators\/[^/]+\.ts$/u.test(f)).sort()) {
  let imports = closure(m, false)
  let all = closure(m, true)
  let code = [...all].reduce((s, f) => s + (style.get(f) ?? 0), 0)
  rows.push([path.basename(m, '.ts'), imports.size, all.size, code])
}
writeFileSync(path.join(dataDir, 'mutator-closures-with-facade.tsv'),
  'mutator\tfiles_by_imports\tfiles_with_facade\tcode_lines_with_facade\n' + rows.map(r => r.join('\t')).join('\n') + '\n')
console.log(rows.map(r => r.join('\t')).join('\n'))
