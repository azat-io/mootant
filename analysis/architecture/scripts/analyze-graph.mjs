// Aggregate metrics over the dependency-cruiser JSON of Mootant (170ec52).
//
// Usage (from the repository root):
//   node analysis/architecture/scripts/analyze-graph.mjs \
//     analysis/architecture/data/depcruise.json analysis/architecture/data
//
// Writes:
//   files.tsv            per-file fan-in / fan-out (value and type-only)
//   folders.tsv          per-folder aggregates (Ca, Ce, instability, single-importer share)
//   folder-edges.tsv     folder -> folder edge weights
//   single-importer.tsv  files with exactly one importer, and whether it is a sibling
//   scc.txt              strongly connected components (value graph and full graph)
//   reach.tsv            transitive closure size from each entry point
//   summary.json         headline numbers used in 01-architecture.md
//   folders.mmd          Mermaid graph of areas (value imports only)

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

let [input, outDir] = process.argv.slice(2)
let data = JSON.parse(readFileSync(input, 'utf8'))

let isLocal = file => /^(core|adapters|cli|types)\//u.test(file)
let modules = data.modules.filter(module => isLocal(module.source))
let sources = new Set(modules.map(module => module.source))

/** Area = top-level layer plus first sub folder ("core/syntax"), or layer root. */
function area(file) {
  let parts = file.split('/')
  if (parts.length === 2) {
    return `${parts[0]}/(root)`
  }
  if (parts[0] === 'core' && parts[1] === 'mutators' && parts[2] === 'shared') {
    return 'core/mutators/shared'
  }
  if (parts[0] === 'adapters' && parts.length > 3) {
    return `${parts[0]}/${parts[1]}/${parts[2]}`
  }
  return `${parts[0]}/${parts[1]}`
}

function layer(file) {
  return file.split('/')[0]
}

// edges: from -> Map(to -> {value: bool, type: bool})
let edges = new Map()
for (let module of modules) {
  let out = new Map()
  for (let dep of module.dependencies) {
    if (!sources.has(dep.resolved)) {
      continue
    }
    let typeOnly = dep.dependencyTypes.includes('type-only')
    let entry = out.get(dep.resolved) ?? { value: false, type: false }
    if (typeOnly) {
      entry.type = true
    } else {
      entry.value = true
    }
    out.set(dep.resolved, entry)
  }
  edges.set(module.source, out)
}

let fanIn = new Map([...sources].map(s => [s, { value: new Set(), type: new Set() }]))
for (let [from, out] of edges) {
  for (let [to, kind] of out) {
    if (kind.value) {
      fanIn.get(to).value.add(from)
    } else {
      fanIn.get(to).type.add(from)
    }
  }
}

// Per-file table.
let fileRows = []
for (let file of [...sources].sort()) {
  let out = edges.get(file)
  let outValue = [...out.values()].filter(kind => kind.value).length
  let outType = [...out.values()].filter(kind => !kind.value).length
  let inValue = fanIn.get(file).value.size
  let inType = fanIn.get(file).type.size
  let outAreas = new Set([...out.keys()].map(area))
  outAreas.delete(area(file))
  fileRows.push({
    file,
    area: area(file),
    outValue,
    outType,
    outAll: outValue + outType,
    inValue,
    inType,
    inAll: inValue + inType,
    outAreas: outAreas.size,
  })
}
writeFileSync(
  path.join(outDir, 'files.tsv'),
  [
    'file\tarea\tfan_out_value\tfan_out_type\tfan_in_value\tfan_in_type\tforeign_areas_used',
    ...fileRows.map(r =>
      [r.file, r.area, r.outValue, r.outType, r.inValue, r.inType, r.outAreas].join('\t'),
    ),
  ].join('\n') + '\n',
)

// Single importer (any import kind) analysis.
let singleRows = []
for (let r of fileRows) {
  let importers = new Set([...fanIn.get(r.file).value, ...fanIn.get(r.file).type])
  if (importers.size === 1) {
    let [importer] = importers
    singleRows.push({
      file: r.file,
      importer,
      sameDir: path.dirname(importer) === path.dirname(r.file),
      sameArea: area(importer) === area(r.file),
    })
  }
}
writeFileSync(
  path.join(outDir, 'single-importer.tsv'),
  [
    'file\timporter\tsame_dir\tsame_area',
    ...singleRows.map(r => [r.file, r.importer, r.sameDir, r.sameArea].join('\t')),
  ].join('\n') + '\n',
)

// Folder aggregates.
let areas = new Map()
for (let r of fileRows) {
  let a = areas.get(r.area) ?? {
    files: 0,
    single: 0,
    singleSameArea: 0,
    zeroImporters: 0,
    ca: new Set(),
    ce: new Set(),
    internalEdges: 0,
    externalOut: 0,
  }
  a.files++
  areas.set(r.area, a)
}
for (let r of singleRows) {
  let a = areas.get(area(r.file))
  a.single++
  if (r.sameArea) {
    a.singleSameArea++
  }
}
for (let r of fileRows) {
  if (r.inAll === 0) {
    areas.get(r.area).zeroImporters++
  }
}
let areaEdges = new Map()
for (let [from, out] of edges) {
  for (let [to, kind] of out) {
    let af = area(from)
    let at = area(to)
    if (af === at) {
      areas.get(af).internalEdges++
      continue
    }
    areas.get(af).externalOut++
    areas.get(af).ce.add(at)
    areas.get(at).ca.add(af)
    let key = `${af}\t${at}`
    let w = areaEdges.get(key) ?? { value: 0, type: 0 }
    if (kind.value) {
      w.value++
    } else {
      w.type++
    }
    areaEdges.set(key, w)
  }
}
let folderRows = [...areas.entries()].sort((a, b) => a[0].localeCompare(b[0]))
writeFileSync(
  path.join(outDir, 'folders.tsv'),
  [
    'area\tfiles\tsingle_importer\tsingle_importer_same_area\tno_importers\tinternal_edges\toutgoing_edges\tCa_areas\tCe_areas\tinstability',
    ...folderRows.map(([name, a]) =>
      [
        name,
        a.files,
        a.single,
        a.singleSameArea,
        a.zeroImporters,
        a.internalEdges,
        a.externalOut,
        a.ca.size,
        a.ce.size,
        (a.ce.size / Math.max(1, a.ca.size + a.ce.size)).toFixed(2),
      ].join('\t'),
    ),
  ].join('\n') + '\n',
)
writeFileSync(
  path.join(outDir, 'folder-edges.tsv'),
  [
    'from\tto\tvalue_edges\ttype_only_edges',
    ...[...areaEdges.entries()]
      .sort((a, b) => b[1].value + b[1].type - (a[1].value + a[1].type))
      .map(([key, w]) => `${key}\t${w.value}\t${w.type}`),
  ].join('\n') + '\n',
)

// Tarjan SCC.
function scc(useTypeEdges) {
  let index = 0
  let stack = []
  let onStack = new Set()
  let indices = new Map()
  let low = new Map()
  let result = []
  function strong(v) {
    indices.set(v, index)
    low.set(v, index)
    index++
    stack.push(v)
    onStack.add(v)
    for (let [w, kind] of edges.get(v)) {
      if (!useTypeEdges && !kind.value) {
        continue
      }
      if (!indices.has(w)) {
        strong(w)
        low.set(v, Math.min(low.get(v), low.get(w)))
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), indices.get(w)))
      }
    }
    if (low.get(v) === indices.get(v)) {
      let component = []
      let w
      do {
        w = stack.pop()
        onStack.delete(w)
        component.push(w)
      } while (w !== v)
      if (component.length > 1) {
        result.push(component.sort())
      }
    }
  }
  for (let v of sources) {
    if (!indices.has(v)) {
      strong(v)
    }
  }
  return result
}
let sccValue = scc(false)
let sccAll = scc(true)
writeFileSync(
  path.join(outDir, 'scc.txt'),
  [
    '# Strongly connected components with more than one file',
    '## value imports only',
    ...sccValue.map(c => `- (${c.length}) ${c.join(', ')}`),
    '## value and type-only imports',
    ...sccAll.map(c => `- (${c.length}) ${c.join(', ')}`),
  ].join('\n') + '\n',
)

// Reachability from entries (value + type, and value only).
function reach(entry, useTypeEdges) {
  let seen = new Set([entry])
  let queue = [entry]
  while (queue.length > 0) {
    let v = queue.pop()
    for (let [w, kind] of edges.get(v)) {
      if (!useTypeEdges && !kind.value) {
        continue
      }
      if (!seen.has(w)) {
        seen.add(w)
        queue.push(w)
      }
    }
  }
  return seen
}
let entries = [
  'core/index.ts',
  'core/runtime/index.ts',
  'core/run-mutants.ts',
  'core/list-mutants.ts',
  'cli/index.ts',
  'cli/run-mutation.ts',
  'cli/run-list.ts',
  'cli/built-in-adapters.ts',
  'adapters/vitest/index.ts',
  'adapters/vitest/runner.ts',
  'adapters/node-test/index.ts',
  'adapters/node-test/preload/preload.ts',
  'adapters/node-test/preload/hooks.ts',
  'adapters/node-test/preload/reporter.ts',
]
let reachRows = []
for (let entry of entries) {
  if (!sources.has(entry)) {
    continue
  }
  let all = reach(entry, true)
  let value = reach(entry, false)
  let byLayer = {}
  for (let f of value) {
    byLayer[layer(f)] = (byLayer[layer(f)] ?? 0) + 1
  }
  reachRows.push({ entry, all: all.size, value: value.size, byLayer })
}
writeFileSync(
  path.join(outDir, 'reach.tsv'),
  [
    'entry\treachable_all\treachable_value\tvalue_by_layer',
    ...reachRows.map(r => `${r.entry}\t${r.all}\t${r.value}\t${JSON.stringify(r.byLayer)}`),
  ].join('\n') + '\n',
)

// Mermaid at area level, value edges only, layer subgraphs.
let mermaidAreas = [...areas.keys()].sort()
let id = name => name.replaceAll(/[^a-z0-9]/giu, '_')
let lines = ['flowchart LR']
for (let l of ['cli', 'adapters', 'core', 'types']) {
  lines.push(`  subgraph ${l}`)
  for (let a of mermaidAreas.filter(x => layer(x) === l)) {
    lines.push(`    ${id(a)}["${a.slice(l.length + 1)} (${areas.get(a).files})"]`)
  }
  lines.push('  end')
}
for (let [key, w] of areaEdges) {
  let [from, to] = key.split('\t')
  if (w.value > 0 && layer(to) !== 'types') {
    lines.push(`  ${id(from)} -->|${w.value}| ${id(to)}`)
  }
}
writeFileSync(path.join(outDir, 'folders.mmd'), lines.join('\n') + '\n')

// Summary.
let byLayerFiles = {}
for (let r of fileRows) {
  byLayerFiles[layer(r.file)] = (byLayerFiles[layer(r.file)] ?? 0) + 1
}
let nonTypeFiles = fileRows.filter(r => !r.file.endsWith('.d.ts'))
let summary = {
  files: fileRows.length,
  byLayerFiles,
  localEdges: [...edges.values()].reduce((sum, out) => sum + out.size, 0),
  valueEdges: [...edges.values()].reduce(
    (sum, out) => sum + [...out.values()].filter(k => k.value).length,
    0,
  ),
  singleImporterFiles: singleRows.length,
  singleImporterSameDir: singleRows.filter(r => r.sameDir).length,
  singleImporterNonDts: singleRows.filter(r => !r.file.endsWith('.d.ts')).length,
  noImporters: fileRows.filter(r => r.inAll === 0).map(r => r.file),
  sccValue: sccValue.map(c => c.length),
  sccAll: sccAll.map(c => c.length),
  topFanOut: [...nonTypeFiles]
    .sort((a, b) => b.outValue - a.outValue)
    .slice(0, 25)
    .map(r => `${r.file} value=${r.outValue} type=${r.outType} areas=${r.outAreas}`),
  topFanInValue: [...fileRows]
    .sort((a, b) => b.inValue - a.inValue)
    .slice(0, 25)
    .map(r => `${r.file} in_value=${r.inValue} in_type=${r.inType}`),
  topFanInType: [...fileRows]
    .sort((a, b) => b.inType - a.inType)
    .slice(0, 15)
    .map(r => `${r.file} in_type=${r.inType}`),
  topForeignAreas: [...nonTypeFiles]
    .sort((a, b) => b.outAreas - a.outAreas)
    .slice(0, 15)
    .map(r => `${r.file} foreign_areas=${r.outAreas} out=${r.outAll}`),
  reach: reachRows,
}
writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
