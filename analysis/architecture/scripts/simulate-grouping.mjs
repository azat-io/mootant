// Simulates the grouping rule proposed in 01-architecture.md on the real
// import graph, to estimate how many source and test files it removes and how
// the transitive closures of mutators change. Nothing in the repository is
// changed: the script only maps file -> module.
//
// Usage (from the repository root, after analyze-graph.mjs and
// code-style-metrics.mjs):
//   node analysis/architecture/scripts/simulate-grouping.mjs analysis/architecture/data
//
// Writes grouping-simulation.json and grouping-map.tsv.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

let [dataDir] = process.argv.slice(2)
let graph = JSON.parse(readFileSync(path.join(dataDir, 'depcruise.json'), 'utf8'))
let style = new Map(
  readFileSync(path.join(dataDir, 'style-files.tsv'), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map(line => line.split('\t'))
    .map(cols => [cols[0], { lines: +cols[2], code: +cols[8] }]),
)
let modules = graph.modules.filter(
  m => /^(core|adapters|cli)\//u.test(m.source) && style.has(m.source) && !m.source.endsWith('.d.ts'),
)
let byFile = new Map(modules.map(m => [m.source, m]))
let localDeps = file =>
  byFile
    .get(file)
    .dependencies.filter(dep => byFile.has(dep.resolved))
    .map(dep => dep.resolved)

// K2: extension points and entries are never merged into something else.
let isEntry = file =>
  /^core\/mutators\/[^/]+\.ts$/u.test(file) ||
  /\/index\.ts$/u.test(file) ||
  /^core\/presets\//u.test(file) ||
  /^adapters\/vitest\/runner\.ts$/u.test(file) ||
  /^adapters\/node-test\/preload\/(preload|hooks|reporter)\.ts$/u.test(file) ||
  /^cli\/html\/client\/main\.ts$/u.test(file) ||
  /^cli\/(run-list|run-mutation|built-in-adapters)\.ts$/u.test(file) ||
  /^core\/(run-mutants|list-mutants)\.ts$/u.test(file)

// A facade binds many siblings; it does not own them (G1 excludes it).
let sameDirFanOut = file =>
  localDeps(file).filter(dep => path.dirname(dep) === path.dirname(file)).length
let isFacade = file => sameDirFanOut(file) >= 10

// G2/G3/G4: explicit concept groups found in the analysis.
let groups = {
  'core/hints/type-view.ts': [
    'get-type-view', 'is-always-nullish', 'may-be-nullish', 'is-non-nullable', 'may-be-boolean',
    'is-always-truthy', 'has-defined-falsy-value', 'is-number-type', 'is-non-number-type',
    'get-canonical-falsy', 'is-canonical-falsy',
  ].map(name => `core/mutators/shared/${name}.ts`),
  'core/syntax/logging.ts': [
    'is-logging-call', 'is-logger-name', 'is-logger-label', 'is-log-message', 'is-logger-factory-call',
    'find-logging-calls', 'is-console-path', 'find-message-texts', 'is-format-free', 'is-plain-message',
  ].map(name => `core/syntax/${name}.ts`),
  'core/syntax/member-chain.ts': [
    'get-member-path', 'get-member-root', 'get-root-name', 'get-chain-root', 'get-chain-end',
    'is-read-chain', 'is-written-member',
  ].map(name => `core/syntax/${name}.ts`),
  'core/syntax/loops.ts': [
    'advances-loop', 'get-exited-loops', 'is-caught-in-loop', 'is-loop-advance-value', 'is-loop-test',
    'is-tested-loop',
  ].map(name => `core/syntax/${name}.ts`),
  'core/git/read-changed-lines.ts': ['find-git-root', 'get-merge-base', 'run-git', 'read-changed-lines'].map(
    name => `core/git/${name}.ts`,
  ),
  'core/git/parse-diff.ts': ['parse-unified-diff', 'parse-binary-paths', 'unquote-git-path'].map(
    name => `core/git/${name}.ts`,
  ),
  'core/mutators/plans/literal.ts': [
    'get-literal-skip', 'get-literal-flip', 'get-branch-copy-skip', 'get-or-default-skip', 'get-literal-mutator',
  ].map(name => `core/mutators/shared/${name}.ts`),
  'core/mutators/plans/logical.ts': [
    'get-logical-drops', 'get-group-constant', 'has-polar-mutant', 'get-nullish-directions', 'get-nullish-plan',
  ].map(name => `core/mutators/shared/${name}.ts`),
  'core/mutators/plans/condition.ts': ['get-condition-constants', 'get-owned-constants'].map(
    name => `core/mutators/shared/${name}.ts`,
  ),
  'core/mutators/plans/ownership.ts': [
    'get-owner-constant', 'get-toward-mutant', 'create-static-run-context',
  ].map(name => `core/mutators/shared/${name}.ts`),
  'adapters/node-test/preload/keys.ts': ['loaded-key', 'served-key', 'reported-key'].map(
    name => `adapters/node-test/preload/${name}.ts`,
  ),
  'core/runtime/keys.ts': ['runtime-global', 'runtime-symbol-key', 'runtime-version'].map(
    name => `core/runtime/${name}.ts`,
  ),
  'core/mutators/shared/skip-notes.ts': ['leave-now-skip', 'no-op-callback-skip'].map(
    name => `core/mutators/shared/${name}.ts`,
  ),
}
// EXTENDED=1: also regroup the rest of core/mutators/shared by concept.
if (process.env.EXTENDED === '1') {
  let shared = names => names.map(name => `core/mutators/shared/${name}.ts`)
  Object.assign(groups, {
    'core/mutators/shared/boolean-mode.ts': shared([
      'is-boolean-mode', 'is-boolean-mode-operand', 'is-boolean-valued', 'is-boolean-result',
      'is-boolean-result-source', 'is-expected-boolean', 'is-lookup-position', 'is-and-or',
      'is-negation', 'get-negation-top', 'get-innermost', 'get-fixed-truth',
    ]),
    'core/mutators/shared/callbacks.ts': shared([
      'get-callback-owner', 'get-callback-result', 'empties-callback', 'is-no-op-callback-constant',
      'is-no-op-callback-literal', 'is-comparator-result',
    ]),
    'core/mutators/shared/returns.ts': shared([
      'get-function-returns', 'get-return-switch', 'get-return-value-kind', 'get-returned-value',
      'is-plain-return-value', 'is-whole-body', 'is-tail-position',
    ]),
    'core/mutators/shared/literal-values.ts': shared([
      'get-literal-value', 'get-next-literal-value', 'get-shifted-literal', 'get-number-text',
      'is-number-literal', 'get-literal-truth', 'is-truth-flipping-literal', 'is-global-identifier',
    ]),
    'core/mutators/plans/comparison.ts': shared([
      'get-comparison-plan', 'has-other-exit', 'get-proven-comparison-value', 'get-typeof-name',
      'is-comparison', 'is-comparison-operand', 'is-numeric-pair',
    ]),
    'core/mutators/shared/nullish.ts': shared([
      'is-nullish-constant', 'is-falsy-constant', 'distinguishes-nullish-swap', 'get-nullish-swap-skip',
    ]),
    'core/mutators/shared/loop-running.ts': shared([
      'get-loop-running-skip', 'get-running-value', 'get-leave-now-value',
    ]),
    'core/mutators/shared/calls.ts': shared(['get-call-target', 'get-call-top', 'is-timer-wait', 'is-typed-by-method-name']),
  })
  groups['core/mutators/shared/skip-notes.ts'].push(...[])
  groups['core/mutators/plans/logical.ts'].push(...shared(['is-constant-eligible-group']))
  groups['core/mutators/plans/literal.ts'].push(...shared(['is-void-operand']))
}
let moduleOf = new Map()
for (let [target, members] of Object.entries(groups)) {
  for (let member of members) {
    if (!byFile.has(member)) {
      throw new Error(`Unknown file ${member}`)
    }
    moduleOf.set(member, target)
  }
}

// G1: private small steps go into their only importer (same folder, not a
// facade), applied until nothing changes; the threshold is in code lines.
let LIMIT = Number(process.env.G1_LIMIT ?? 40)
let g1 = []
for (let module of modules) {
  let file = module.source
  if (moduleOf.has(file) || isEntry(file)) {
    continue
  }
  let importers = [...new Set(module.dependents ?? [])].filter(f => byFile.has(f))
  if (importers.length !== 1) {
    continue
  }
  let [importer] = importers
  if (path.dirname(importer) !== path.dirname(file) || isFacade(importer)) {
    continue
  }
  if (style.get(file).code >= LIMIT) {
    continue
  }
  g1.push([file, importer])
}
let g1Map = new Map(g1)
let resolve = file => {
  let seen = new Set()
  let current = file
  while (!seen.has(current)) {
    seen.add(current)
    if (moduleOf.has(current) && moduleOf.get(current) !== current) {
      current = moduleOf.get(current)
      continue
    }
    if (g1Map.has(current)) {
      current = g1Map.get(current)
      continue
    }
    break
  }
  return current
}
let target = new Map(modules.map(m => [m.source, resolve(m.source)]))

let after = new Set(target.values())
let moduleCode = new Map()
for (let [file, module] of target) {
  moduleCode.set(module, (moduleCode.get(module) ?? 0) + style.get(file).code)
}
let biggest = [...moduleCode.entries()]
  .filter(([module]) => [...target.entries()].filter(([, m]) => m === module).length > 1)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)

// Test files: one per module; tests of merged files merge into it.
let testsBefore = modules.filter(m => existsSync(`test/${m.source.replace(/\.ts$/u, '.test.ts')}`)).length
let testsAfter = new Set(
  modules
    .filter(m => existsSync(`test/${m.source.replace(/\.ts$/u, '.test.ts')}`))
    .map(m => target.get(m.source)),
).size

// Transitive closure of mutators, in files and in modules.
function closure(file) {
  let seen = new Set()
  let queue = [file]
  while (queue.length > 0) {
    let current = queue.pop()
    if (seen.has(current)) {
      continue
    }
    seen.add(current)
    for (let dep of byFile.get(current).dependencies) {
      if (byFile.has(dep.resolved) && !dep.dependencyTypes.includes('type-only')) {
        queue.push(dep.resolved)
      }
    }
  }
  seen.delete(file)
  return seen
}
// The same closure with the dependencies hidden behind `context.syntax`: a
// call `.isLoopTest(` in a mutator file adds core/syntax/is-loop-test.ts.
let methods = [...readFileSync('types/syntax/syntax-helpers.d.ts', 'utf8').matchAll(/^ {2}([a-zA-Z]+)[(:]/gmu)].map(
  m => m[1],
)
let kebab = name => name.replaceAll(/[A-Z]/gu, c => `-${c.toLowerCase()}`)
let implOf = new Map()
for (let method of methods) {
  let file = [`core/syntax/${kebab(method)}.ts`, `core/tree/${kebab(method)}.ts`, `core/regex/${kebab(method)}.ts`].find(
    f => byFile.has(f),
  )
  if (file) {
    implOf.set(method, file)
  }
}
function facadeClosure(file) {
  let seen = new Set()
  let queue = [file]
  while (queue.length > 0) {
    let current = queue.pop()
    if (seen.has(current)) {
      continue
    }
    seen.add(current)
    for (let dep of byFile.get(current).dependencies) {
      if (byFile.has(dep.resolved) && !dep.dependencyTypes.includes('type-only')) {
        queue.push(dep.resolved)
      }
    }
    if (current.startsWith('core/mutators/')) {
      let text = readFileSync(current, 'utf8')
      for (let [method, impl] of implOf) {
        if (new RegExp(`\\.${method}\\b`, 'u').test(text)) {
          queue.push(impl)
        }
      }
    }
  }
  seen.delete(file)
  return seen
}
let mutators = modules.map(m => m.source).filter(f => /^core\/mutators\/[^/]+\.ts$/u.test(f))
let closures = Object.fromEntries(
  mutators.map(f => {
    let files = closure(f)
    let mods = new Set([...files].map(x => target.get(x)))
    mods.delete(target.get(f))
    let hidden = facadeClosure(f)
    let hiddenMods = new Set([...hidden].map(x => target.get(x)))
    hiddenMods.delete(target.get(f))
    return [
      path.basename(f, '.ts'),
      { files: files.size, modules: mods.size, filesWithFacade: hidden.size, modulesWithFacade: hiddenMods.size },
    ]
  }),
)

// Import statements between files that end up in different modules.
let importsBefore = 0
let importsAfter = 0
for (let module of modules) {
  let deps = new Set(localDeps(module.source))
  importsBefore += deps.size
  let targets = new Set([...deps].map(d => target.get(d)))
  targets.delete(target.get(module.source))
  importsAfter += targets.size
}

let result = {
  g1Limit: LIMIT,
  sourceFilesBefore: modules.length,
  sourceFilesAfter: after.size,
  mergedByG1: g1.length,
  mergedByGroups: [...moduleOf.keys()].length,
  testFilesBefore: testsBefore,
  testFilesAfter: testsAfter,
  localImportEdgesBefore: importsBefore,
  localImportEdgesAfter: importsAfter,
  biggestMergedModules: biggest.map(([m, code]) => `${m} code=${code}`),
  mutatorClosures: closures,
}
writeFileSync(path.join(dataDir, 'grouping-simulation.json'), JSON.stringify(result, null, 2) + '\n')
writeFileSync(
  path.join(dataDir, 'grouping-map.tsv'),
  'file\tmodule\n' +
    [...target.entries()]
      .filter(([f, m]) => f !== m)
      .map(([f, m]) => `${f}\t${m}`)
      .join('\n') +
    '\n',
)
console.log(JSON.stringify(result, null, 2))
