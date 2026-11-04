// Extra tables cited in 01-architecture.md that the other scripts do not
// write: types by visibility, sources without a test twin, private-helper
// merge candidates, tests per source, transitive closures of mutators and the
// use of SyntaxHelpers methods by the core.
//
// Usage (from the repository root, after analyze-graph.mjs and
// code-style-metrics.mjs):
//   node analysis/architecture/scripts/extra-metrics.mjs analysis/architecture/data

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'

let [dataDir] = process.argv.slice(2)
let graph = JSON.parse(readFileSync(path.join(dataDir, 'depcruise.json'), 'utf8'))
let testGraph = JSON.parse(readFileSync(path.join(dataDir, 'depcruise-tests.json'), 'utf8'))
let style = new Map(
  readFileSync(path.join(dataDir, 'style-files.tsv'), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map(line => line.split('\t'))
    .map(cols => [cols[0], { lines: +cols[2], code: +cols[8] }]),
)
let byFile = new Map(graph.modules.map(m => [m.source, m]))
let isLocal = file => /^(core|adapters|cli|types)\//u.test(file)

// 1. Types of types/ by visibility.
let entries = ['core/index.ts', 'core/runtime/index.ts', 'adapters/vitest/index.ts', 'adapters/node-test/index.ts']
let publicTypes = new Set()
let queue = entries.flatMap(e => byFile.get(e).dependencies.map(d => d.resolved).filter(f => f.endsWith('.d.ts')))
while (queue.length > 0) {
  let file = queue.pop()
  if (publicTypes.has(file)) {
    continue
  }
  publicTypes.add(file)
  for (let dep of byFile.get(file)?.dependencies ?? []) {
    if (isLocal(dep.resolved)) {
      queue.push(dep.resolved)
    }
  }
}
let typeRows = []
for (let module of graph.modules.filter(m => m.source.startsWith('types/'))) {
  let users = (module.dependents ?? []).filter(f => !f.startsWith('types/'))
  let layers = new Set(users.map(f => f.split('/')[0]))
  let category = publicTypes.has(module.source)
    ? 'public'
    : layers.size >= 2
      ? 'multiLayer'
      : users.length === 1
        ? 'oneFile'
        : users.length === 0
          ? 'none'
          : 'oneLayer'
  typeRows.push([module.source, category, users.length, [...layers].join(',')])
}
writeFileSync(
  path.join(dataDir, 'types-visibility.tsv'),
  'file\tcategory\tnon_type_importers\tlayers\n' + typeRows.map(r => r.join('\t')).join('\n') + '\n',
)

// 2. Sources without a test twin.
function walk(dir, out = []) {
  for (let name of readdirSync(dir)) {
    let full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full, out)
    } else {
      out.push(full)
    }
  }
  return out
}
let sources = ['core', 'adapters', 'cli'].flatMap(d => walk(d)).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
let missing = sources.filter(f => !existsSync(`test/${f.replace(/\.ts$/u, '.test.ts')}`))
writeFileSync(path.join(dataDir, 'sources-without-test-twin.txt'), missing.join('\n') + '\n')

// 3. Test files importing each source, and private-helper merge candidates.
let testImporters = new Map()
for (let module of testGraph.modules) {
  if (!module.source.startsWith('test/')) {
    continue
  }
  for (let dep of module.dependencies) {
    if (/^(core|adapters|cli)\//u.test(dep.resolved)) {
      let set = testImporters.get(dep.resolved) ?? new Set()
      set.add(module.source)
      testImporters.set(dep.resolved, set)
    }
  }
}
writeFileSync(
  path.join(dataDir, 'test-importers-per-source.tsv'),
  'source\ttest_files_importing\n' +
    [...testImporters.entries()]
      .sort((a, b) => b[1].size - a[1].size)
      .map(([f, s]) => `${f}\t${s.size}`)
      .join('\n') +
    '\n',
)
let isEntry = file =>
  /(^core\/mutators\/[^/]+\.ts$)|(index\.ts$)|(runner\.ts$)|(preload\/(preload|hooks|reporter)\.ts$)|(^cli\/html\/client\/main\.ts$)|(^core\/presets\/)/u.test(
    file,
  )
let candidates = []
for (let file of sources) {
  let module = byFile.get(file)
  let importers = [...new Set(module?.dependents ?? [])]
  if (importers.length !== 1 || path.dirname(importers[0]) !== path.dirname(file) || isEntry(file)) {
    continue
  }
  let info = style.get(file)
  if (!info || info.code >= 40) {
    continue
  }
  let twin = `test/${file.replace(/\.ts$/u, '.test.ts')}`
  let others = [...(testImporters.get(file) ?? [])].filter(t => t !== twin).length
  candidates.push([file, importers[0], info.code, info.lines, others])
}
writeFileSync(
  path.join(dataDir, 'merge-candidates-private-helpers.tsv'),
  'file\timporter\tcode_lines\tlines\ttests_outside_twin\n' + candidates.map(r => r.join('\t')).join('\n') + '\n',
)

// 4. Transitive closure of every mutator (value imports).
function closure(file) {
  let seen = new Set()
  let stack = [file]
  while (stack.length > 0) {
    let current = stack.pop()
    if (seen.has(current)) {
      continue
    }
    seen.add(current)
    for (let dep of byFile.get(current)?.dependencies ?? []) {
      if (/^(core|adapters|cli)\//u.test(dep.resolved) && !dep.dependencyTypes.includes('type-only')) {
        stack.push(dep.resolved)
      }
    }
  }
  seen.delete(file)
  return seen
}
let mutators = sources.filter(f => /^core\/mutators\/[^/]+\.ts$/u.test(f)).sort()
writeFileSync(
  path.join(dataDir, 'mutator-closures.tsv'),
  'mutator\tfiles\tcode_lines\n' +
    mutators
      .map(f => {
        let files = closure(f)
        let code = [...files].reduce((s, x) => s + (style.get(x)?.code ?? 0), 0)
        return `${f}\t${files.size}\t${code}`
      })
      .join('\n') +
    '\n',
)

// 5. SyntaxHelpers methods and the core files that call them.
let helpersType = readFileSync('types/syntax/syntax-helpers.d.ts', 'utf8')
let methods = [...helpersType.matchAll(/^ {2}([a-zA-Z]+)[(:]/gmu)].map(m => m[1])
let coreFiles = sources.filter(f => f.startsWith('core/') && !f.startsWith('core/syntax/'))
let usage = methods.map(method => {
  let pattern = new RegExp(`\\.${method}\\b`, 'u')
  let users = coreFiles.filter(f => pattern.test(readFileSync(f, 'utf8')))
  return [method, users.length, users.join(' ')]
})
writeFileSync(
  path.join(dataDir, 'syntax-helpers-usage.tsv'),
  'method\tcore_files_using\tfiles\n' +
    usage
      .sort((a, b) => a[1] - b[1])
      .map(r => r.join('\t'))
      .join('\n') +
    '\n',
)
console.log({
  types: Object.fromEntries(
    ['public', 'multiLayer', 'oneLayer', 'oneFile', 'none'].map(c => [c, typeRows.filter(r => r[1] === c).length]),
  ),
  sourcesWithoutTwin: missing.length,
  mergeCandidates: candidates.length,
  syntaxMethods: methods.length,
  syntaxUnused: usage.filter(r => r[1] === 0).map(r => r[0]),
  syntaxSingleUse: usage.filter(r => r[1] === 1).length,
})
