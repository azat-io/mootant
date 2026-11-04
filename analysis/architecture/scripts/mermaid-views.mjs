// Readable Mermaid views of the folder graph (the full one in folders.mmd has
// 100 edges). Value imports only; type-only imports are left out.
//
// Usage (from the repository root, after analyze-graph.mjs):
//   node analysis/architecture/scripts/mermaid-views.mjs analysis/architecture/data
//
// Writes:
//   layers.mmd  layers and adapters, with edge weights
//   core.mmd    core sub folders, edges with weight >= 2, back edges dashed

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

let [dataDir] = process.argv.slice(2)
let edges = readFileSync(path.join(dataDir, 'folder-edges.tsv'), 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map(line => line.split('\t'))
  .map(([from, to, value, type]) => ({ from, to, value: +value, type: +type }))

let id = name => name.replaceAll(/[^a-z0-9]/giu, '_')

// Layer view.
let group = area => {
  if (area.startsWith('adapters/vitest')) {
    return 'adapters/vitest'
  }
  if (area.startsWith('adapters/node-test')) {
    return 'adapters/node-test'
  }
  if (area.startsWith('adapters/shared')) {
    return 'adapters/shared'
  }
  if (area === 'core/runtime') {
    return 'core/runtime'
  }
  if (area === 'core/(root)' || area.startsWith('core/')) {
    return 'core'
  }
  if (area.startsWith('cli/html')) {
    return 'cli/html'
  }
  if (area.startsWith('cli/')) {
    return 'cli'
  }
  return area.split('/')[0]
}
let layerEdges = new Map()
for (let edge of edges) {
  let from = group(edge.from)
  let to = group(edge.to)
  if (from === to) {
    continue
  }
  let key = `${from}\t${to}`
  let weight = layerEdges.get(key) ?? { value: 0, type: 0 }
  weight.value += edge.value
  weight.type += edge.type
  layerEdges.set(key, weight)
}
let layerLines = ['flowchart TB']
for (let [key, weight] of layerEdges) {
  let [from, to] = key.split('\t')
  let label = weight.value > 0 ? `${weight.value}` : `type ${weight.type}`
  let arrow = weight.value > 0 ? '-->' : '-.->'
  layerLines.push(`  ${id(from)}["${from}"] ${arrow}|${label}| ${id(to)}["${to}"]`)
}
writeFileSync(path.join(dataDir, 'layers.mmd'), layerLines.join('\n') + '\n')

// Core view.
let core = edges.filter(
  edge => edge.from.startsWith('core/') && edge.to.startsWith('core/') && edge.value > 0,
)
let pairs = new Set(core.map(edge => `${edge.from}\t${edge.to}`))
let coreLines = ['flowchart LR']
let linkIndex = 0
let backLinks = []
for (let edge of core.toSorted((a, b) => b.value - a.value)) {
  let back = pairs.has(`${edge.to}\t${edge.from}`) && edge.value <= 3
  if (edge.value < 2 && !back) {
    continue
  }
  let from = edge.from.slice(5)
  let to = edge.to.slice(5)
  coreLines.push(
    `  ${id(from)}["${from}"] ${back ? '-.->' : '-->'}|${edge.value}| ${id(to)}["${to}"]`,
  )
  if (back) {
    backLinks.push(linkIndex)
  }
  linkIndex++
}
if (backLinks.length > 0) {
  coreLines.push(`  linkStyle ${backLinks.join(',')} stroke:#d33,stroke-width:2px`)
}
writeFileSync(path.join(dataDir, 'core.mmd'), coreLines.join('\n') + '\n')
console.log(layerLines.join('\n'))
console.log(coreLines.join('\n'))
