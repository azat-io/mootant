// Line-level style metrics of Mootant (170ec52): import noise, JSDoc share,
// functions per file, exports per file. Parses every file with oxc-parser, so
// multi-line imports and comments are counted exactly.
//
// Usage (from the repository root):
//   node analysis/architecture/scripts/code-style-metrics.mjs \
//     analysis/architecture/data
//
// oxc-parser is loaded from /home/user/tools-arch (installed outside the repo).
//
// Writes:
//   style-files.tsv   per file: lines, import lines, jsdoc lines, code lines,
//                     imports (local/external, value/type), top-level and
//                     exported functions
//   style-areas.tsv   the same aggregated per area
//   style-summary.json

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

let require = createRequire('/home/user/tools-arch/package.json')
let { parseSync } = require('oxc-parser')

let [outDir] = process.argv.slice(2)
let roots = ['core', 'adapters', 'cli', 'types', 'test']

function walk(dir, out = []) {
  for (let name of readdirSync(dir)) {
    let full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (full.startsWith('test/fixtures')) {
        continue
      }
      walk(full, out)
    } else if (/\.ts$/u.test(name)) {
      out.push(full)
    }
  }
  return out
}

function area(file) {
  let parts = file.split('/')
  if (parts[0] === 'test') {
    return parts.length <= 3 ? `test/${parts[1]}` : `test/${parts[1]}/${parts[2]}`
  }
  if (parts.length === 2) {
    return `${parts[0]}/(root)`
  }
  if (parts[0] === 'core' && parts[1] === 'mutators' && parts[2] === 'shared') {
    return 'core/mutators/shared'
  }
  return `${parts[0]}/${parts[1]}`
}

let rows = []
for (let file of roots.flatMap(root => walk(root))) {
  let text = readFileSync(file, 'utf8')
  let lines = text.split('\n')
  if (lines.at(-1) === '') {
    lines.pop()
  }
  let lineStarts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      lineStarts.push(i + 1)
    }
  }
  let lineOf = offset => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      let mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= offset) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    return lo
  }
  let lang = file.endsWith('.d.ts') ? 'dts' : 'ts'
  let { program, comments } = parseSync(file, text, { lang })
  let kind = new Array(lines.length).fill('code')
  lines.forEach((line, i) => {
    if (line.trim() === '') {
      kind[i] = 'blank'
    }
  })
  let imports = { local: 0, external: 0, value: 0, type: 0, statements: 0 }
  for (let node of program.body) {
    if (node.type === 'ImportDeclaration') {
      imports.statements++
      let source = node.source.value
      if (source.startsWith('.')) {
        imports.local++
      } else {
        imports.external++
      }
      if (node.importKind === 'type') {
        imports.type++
      } else {
        imports.value++
      }
      for (let l = lineOf(node.start); l <= lineOf(node.end - 1); l++) {
        kind[l] = 'import'
      }
    }
    if (
      (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
      node.source
    ) {
      for (let l = lineOf(node.start); l <= lineOf(node.end - 1); l++) {
        kind[l] = 'reexport'
      }
    }
  }
  for (let comment of comments) {
    let jsdoc = comment.type === 'Block' && comment.value.startsWith('*')
    for (let l = lineOf(comment.start); l <= lineOf(comment.end - 1); l++) {
      if (kind[l] === 'code' || kind[l] === 'blank') {
        kind[l] = jsdoc ? 'jsdoc' : 'comment'
      }
    }
  }
  let topFunctions = 0
  let exportedFunctions = 0
  let exportedNames = 0
  let nestedFunctionDeclarations = 0
  for (let node of program.body) {
    let declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    let exported = node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration'
    if (node.type === 'ExportNamedDeclaration' && !node.declaration) {
      exportedNames += node.specifiers.length
    }
    if (!declaration) {
      continue
    }
    if (declaration.type === 'FunctionDeclaration' || declaration.type === 'TSDeclareFunction') {
      topFunctions++
      if (exported) {
        exportedFunctions++
      }
    }
    if (declaration.type === 'VariableDeclaration') {
      for (let d of declaration.declarations) {
        if (
          d.init &&
          (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression')
        ) {
          topFunctions++
          if (exported) {
            exportedFunctions++
          }
        }
      }
    }
    if (exported) {
      exportedNames++
    }
  }
  // Count nested function declarations (helpers defined inside a function).
  let stack = [...program.body]
  let depthMap = new Map(program.body.map(n => [n, 0]))
  while (stack.length > 0) {
    let node = stack.pop()
    let depth = depthMap.get(node) ?? 0
    if (node.type === 'FunctionDeclaration' && depth > 0) {
      nestedFunctionDeclarations++
    }
    let childDepth =
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
        ? depth + 1
        : depth
    for (let key of Object.keys(node)) {
      if (key === 'parent') {
        continue
      }
      let value = node[key]
      if (Array.isArray(value)) {
        for (let child of value) {
          if (child && typeof child.type === 'string') {
            depthMap.set(child, childDepth)
            stack.push(child)
          }
        }
      } else if (value && typeof value === 'object' && typeof value.type === 'string') {
        depthMap.set(value, childDepth)
        stack.push(value)
      }
    }
  }
  let count = k => kind.filter(x => x === k).length
  rows.push({
    file,
    area: area(file),
    dts: file.endsWith('.d.ts'),
    lines: lines.length,
    blank: count('blank'),
    import: count('import'),
    reexport: count('reexport'),
    jsdoc: count('jsdoc'),
    comment: count('comment'),
    code: count('code'),
    importStatements: imports.statements,
    importLocal: imports.local,
    importExternal: imports.external,
    importType: imports.type,
    importValue: imports.value,
    topFunctions,
    exportedFunctions,
    exportedNames,
    nestedFunctionDeclarations,
  })
}

let cols = [
  'file',
  'area',
  'lines',
  'blank',
  'import',
  'reexport',
  'jsdoc',
  'comment',
  'code',
  'importStatements',
  'importLocal',
  'importExternal',
  'importType',
  'importValue',
  'topFunctions',
  'exportedFunctions',
  'exportedNames',
  'nestedFunctionDeclarations',
]
writeFileSync(
  path.join(outDir, 'style-files.tsv'),
  [cols.join('\t'), ...rows.map(r => cols.map(c => r[c]).join('\t'))].join('\n') + '\n',
)

function aggregate(list) {
  let sum = key => list.reduce((s, r) => s + r[key], 0)
  let n = list.length
  let lines = sum('lines')
  return {
    files: n,
    lines,
    avgLines: +(lines / n).toFixed(1),
    medianCode: list.map(r => r.code).sort((a, b) => a - b)[Math.floor(n / 2)],
    importShare: +((sum('import') / lines) * 100).toFixed(1),
    jsdocShare: +((sum('jsdoc') / lines) * 100).toFixed(1),
    commentShare: +((sum('comment') / lines) * 100).toFixed(1),
    codeShare: +((sum('code') / lines) * 100).toFixed(1),
    blankShare: +((sum('blank') / lines) * 100).toFixed(1),
    avgImports: +(sum('importStatements') / n).toFixed(2),
    avgLocalImports: +(sum('importLocal') / n).toFixed(2),
    typeImportShare: +((sum('importType') / Math.max(1, sum('importStatements'))) * 100).toFixed(1),
    codeLines: sum('code'),
    importLines: sum('import'),
    jsdocLines: sum('jsdoc'),
    filesWithOneTopFunction: list.filter(r => r.topFunctions === 1).length,
    filesWithOneExportedFunction: list.filter(r => r.exportedFunctions === 1).length,
    filesUnder15CodeLines: list.filter(r => r.code < 15).length,
    filesUnder30CodeLines: list.filter(r => r.code < 30).length,
    nestedFunctionDeclarations: sum('nestedFunctionDeclarations'),
  }
}

let groups = new Map()
for (let r of rows) {
  let key = r.dts ? `${r.area} [d.ts]` : r.area
  groups.set(key, [...(groups.get(key) ?? []), r])
}
let areaRows = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
let areaCols = Object.keys(aggregate(rows))
writeFileSync(
  path.join(outDir, 'style-areas.tsv'),
  [
    ['area', ...areaCols].join('\t'),
    ...areaRows.map(([name, list]) => {
      let a = aggregate(list)
      return [name, ...areaCols.map(c => a[c])].join('\t')
    }),
  ].join('\n') + '\n',
)

let src = rows.filter(r => !r.dts && !r.file.startsWith('test/'))
let summary = {
  sourceTs: aggregate(src),
  sourceByLayer: Object.fromEntries(
    ['core', 'adapters', 'cli'].map(l => [l, aggregate(src.filter(r => r.file.startsWith(`${l}/`)))]),
  ),
  types: aggregate(rows.filter(r => r.dts && !r.file.startsWith('test/'))),
  adapterDts: aggregate(rows.filter(r => r.dts && r.file.startsWith('adapters/'))),
  tests: aggregate(rows.filter(r => r.file.startsWith('test/'))),
}
writeFileSync(path.join(outDir, 'style-summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
