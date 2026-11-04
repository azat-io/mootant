// Prints the functions with the highest self time in a V8 .cpuprofile and an
// aggregate by source file. Usage: node top-self.mjs <file.cpuprofile> [limit]
import { readFileSync } from 'node:fs'

let [file, limitArg] = process.argv.slice(2)
let limit = Number(limitArg ?? 25)
let profile = JSON.parse(readFileSync(file, 'utf8'))
let nodes = new Map(profile.nodes.map(node => [node.id, node]))
let self = new Map()
let deltas = profile.timeDeltas
for (let [index, id] of profile.samples.entries()) {
  self.set(id, (self.get(id) ?? 0) + (deltas[index] ?? 0))
}
let total = [...self.values()].reduce((a, b) => a + b, 0)
let byFunction = new Map()
let byFile = new Map()
for (let [id, time] of self) {
  let { callFrame } = nodes.get(id)
  let url = callFrame.url.replace(/^file:\/\//u, '')
  let short = url.replace(/^.*\/(node_modules\/\.pnpm\/[^/]+\/node_modules\/|dist\/)/u, '')
  let key = `${callFrame.functionName || '(anonymous)'} ${short}:${callFrame.lineNumber + 1}`
  byFunction.set(key, (byFunction.get(key) ?? 0) + time)
  let fileKey = short || `(${callFrame.functionName})`
  byFile.set(fileKey, (byFile.get(fileKey) ?? 0) + time)
}
let ms = value => (value / 1000).toFixed(0).padStart(7)
let pct = value => ((value / total) * 100).toFixed(1).padStart(5)
console.log(`total sampled: ${(total / 1e6).toFixed(2)} s`)
console.log('\n# self time by function')
for (let [key, time] of [...byFunction].toSorted((a, b) => b[1] - a[1]).slice(0, limit)) {
  console.log(`${ms(time)} ms ${pct(time)}%  ${key}`)
}
console.log('\n# self time by file')
for (let [key, time] of [...byFile].toSorted((a, b) => b[1] - a[1]).slice(0, limit)) {
  console.log(`${ms(time)} ms ${pct(time)}%  ${key}`)
}
