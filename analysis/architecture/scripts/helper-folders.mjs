// Importers of every file in the helper folders, with code size, to find
// single-caller helpers and concept families (shared name stems and shared
// importers).
//
// Usage (from the repository root, after analyze-graph.mjs and
// code-style-metrics.mjs):
//   node analysis/architecture/scripts/helper-folders.mjs analysis/architecture/data
//
// Writes:
//   helpers.tsv           file, code lines, importers (src), importers (tests)
//   helper-families.txt   name-stem families and co-imported clusters

import { readFileSync, writeFileSync } from 'node:fs'
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
    .map(cols => [cols[0], { lines: +cols[2], code: +cols[8], jsdoc: +cols[6] }]),
)

let helperFolders = [
  'core/syntax',
  'core/hints',
  'core/regex',
  'core/text',
  'core/tree',
  'core/mutators/shared',
  'core/run',
  'core/parser',
  'core/cache',
  'adapters/shared',
  'adapters/vitest',
  'adapters/node-test',
  'cli/terminal',
  'cli/report',
]

let local = new Set(graph.modules.map(m => m.source))
let importers = new Map()
let imports = new Map()
for (let module of graph.modules) {
  let out = new Set()
  for (let dep of module.dependencies) {
    if (!local.has(dep.resolved)) {
      continue
    }
    out.add(dep.resolved)
    importers.set(dep.resolved, [...(importers.get(dep.resolved) ?? []), module.source])
  }
  imports.set(module.source, out)
}
let testImporters = new Map()
for (let module of testGraph.modules) {
  if (!module.source.startsWith('test/')) {
    continue
  }
  for (let dep of module.dependencies) {
    if (/^(core|adapters|cli)\//u.test(dep.resolved)) {
      testImporters.set(dep.resolved, [
        ...(testImporters.get(dep.resolved) ?? []),
        module.source,
      ])
    }
  }
}

let folderOf = file => {
  for (let folder of helperFolders.toSorted((a, b) => b.length - a.length)) {
    if (file.startsWith(`${folder}/`)) {
      return folder
    }
  }
  return null
}

let rows = []
for (let file of [...local].sort()) {
  let folder = folderOf(file)
  if (!folder || file.endsWith('.d.ts')) {
    continue
  }
  let rest = file.slice(folder.length + 1)
  if (rest.includes('/') && folder !== 'adapters/vitest' && folder !== 'adapters/node-test') {
    continue
  }
  let srcImporters = [...new Set(importers.get(file) ?? [])]
  let tests = [...new Set(testImporters.get(file) ?? [])]
  let info = style.get(file) ?? { lines: 0, code: 0, jsdoc: 0 }
  rows.push({
    folder,
    file,
    lines: info.lines,
    code: info.code,
    jsdoc: info.jsdoc,
    importerCount: srcImporters.length,
    importers: srcImporters,
    tests: tests.length,
  })
}

writeFileSync(
  path.join(dataDir, 'helpers.tsv'),
  [
    'folder\tfile\tlines\tcode_lines\tjsdoc_lines\tsrc_importers\ttest_importers\timporters',
    ...rows.map(r =>
      [
        r.folder,
        r.file,
        r.lines,
        r.code,
        r.jsdoc,
        r.importerCount,
        r.tests,
        r.importers.join(' '),
      ].join('\t'),
    ),
  ].join('\n') + '\n',
)

// Per-folder summary of single importers.
let out = []
out.push('# Helper folders: single-importer summary')
out.push('folder | files | 1 importer | 1 importer in same folder | 0 importers | code lines (median) | files < 15 code lines')
for (let folder of helperFolders) {
  let list = rows.filter(r => r.folder === folder)
  if (list.length === 0) {
    continue
  }
  let single = list.filter(r => r.importerCount === 1)
  let sameFolder = single.filter(r => folderOf(r.importers[0]) === folder)
  let none = list.filter(r => r.importerCount === 0)
  let codes = list.map(r => r.code).sort((a, b) => a - b)
  out.push(
    `${folder} | ${list.length} | ${single.length} | ${sameFolder.length} | ${none.length} | ${codes[Math.floor(codes.length / 2)]} | ${list.filter(r => r.code < 15).length}`,
  )
}

// Name-stem families.
let stop = new Set([
  'is',
  'get',
  'read',
  'create',
  'find',
  'has',
  'to',
  'of',
  'the',
  'a',
  'build',
  'check',
  'collect',
  'resolve',
  'apply',
  'run',
  'make',
  'format',
  'parse',
  'list',
  'start',
  'write',
  'describe',
  'count',
  'compute',
  'select',
  'load',
  'map',
  'set',
  'add',
  'type',
  'types',
])
let stemOf = word =>
  word
    .replace(/(ings|ing|ers|er|s)$/u, '')
    .replace(/^logg$/u, 'log')
    .replace(/^logg?$/u, 'log')
out.push('')
out.push('# Name-stem families inside each helper folder (>= 3 files share a content word)')
for (let folder of helperFolders) {
  let list = rows.filter(r => r.folder === folder)
  let byStem = new Map()
  for (let r of list) {
    let words = path.basename(r.file, '.ts').split('-')
    for (let word of new Set(words.filter(w => !stop.has(w)).map(stemOf))) {
      byStem.set(word, [...(byStem.get(word) ?? []), r])
    }
  }
  let families = [...byStem.entries()]
    .filter(([, members]) => members.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
  if (families.length === 0) {
    continue
  }
  out.push(`## ${folder}`)
  for (let [stem, members] of families) {
    let code = members.reduce((s, r) => s + r.code, 0)
    out.push(
      `- ${stem} (${members.length} files, ${code} code lines): ${members.map(r => `${path.basename(r.file, '.ts')}[${r.importerCount}]`).join(', ')}`,
    )
  }
}

// Co-import clusters: union files of a helper folder that import each other
// where the imported file has a single importer (private helper of a sibling).
out.push('')
out.push('# Private-helper chains: file -> its only importer (same folder), grouped by the root importer')
for (let folder of helperFolders) {
  let list = rows.filter(r => r.folder === folder)
  let parent = new Map()
  for (let r of list) {
    if (r.importerCount === 1 && folderOf(r.importers[0]) === folder) {
      parent.set(r.file, r.importers[0])
    }
  }
  let rootOf = file => {
    let seen = new Set()
    while (parent.has(file) && !seen.has(file)) {
      seen.add(file)
      file = parent.get(file)
    }
    return file
  }
  let groups = new Map()
  for (let file of parent.keys()) {
    let root = rootOf(file)
    groups.set(root, [...(groups.get(root) ?? []), file])
  }
  let sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
  if (sorted.length === 0) {
    continue
  }
  out.push(`## ${folder}`)
  for (let [root, members] of sorted) {
    let code = [root, ...members].reduce((s, f) => s + (style.get(f)?.code ?? 0), 0)
    out.push(
      `- ${path.basename(root, '.ts')} <- ${members.map(f => path.basename(f, '.ts')).join(', ')} (${members.length + 1} files, ${code} code lines)`,
    )
  }
}

// Shared-importer clusters: pairs of files in a folder whose importer sets
// are identical and have >= 2 importers (always used together).
out.push('')
out.push('# Files always imported together (identical importer sets, >= 2 importers)')
for (let folder of helperFolders) {
  let list = rows.filter(r => r.folder === folder && r.importerCount >= 2)
  let byKey = new Map()
  for (let r of list) {
    let key = [...r.importers].sort().join(' ')
    byKey.set(key, [...(byKey.get(key) ?? []), r])
  }
  let clusters = [...byKey.entries()].filter(([, members]) => members.length >= 2)
  if (clusters.length === 0) {
    continue
  }
  out.push(`## ${folder}`)
  for (let [key, members] of clusters) {
    out.push(
      `- ${members.map(r => path.basename(r.file, '.ts')).join(', ')} <= ${key.split(' ').map(f => f.replace(/^(core|adapters|cli)\//u, '')).join(', ')}`,
    )
  }
}

writeFileSync(path.join(dataDir, 'helper-families.txt'), out.join('\n') + '\n')
console.log(out.join('\n'))
