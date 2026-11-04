// For loop-running skips: is the skipped node a test of a loop, or one exit
// test of an endless loop that has other exits?
// Usage: OXC_FROM=dir node loop-running-exits.mjs REPORT.json ROOT
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

let require = createRequire(path.join(process.env.OXC_FROM ?? process.cwd(), 'x.js'))
let { parseSync } = require('oxc-parser')
let [reportPath, root] = process.argv.slice(2)
let report = JSON.parse(readFileSync(reportPath, 'utf8'))
function walk(node, visit, parents = []) {
  if (!node || typeof node.type !== 'string') return
  visit(node, parents)
  let next = [...parents, node]
  for (let key of Object.keys(node)) {
    let value = node[key]
    if (Array.isArray(value)) value.forEach(child => child && typeof child.type === 'string' && walk(child, visit, next))
    else if (value && typeof value.type === 'string') walk(value, visit, next)
  }
}
let isFunction = n => ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(n.type)
let isEndless = n => (n.type === 'ForStatement' && !n.test) || ((n.type === 'WhileStatement' || n.type === 'DoWhileStatement' || n.type === 'ForStatement') && n.test?.type === 'Literal' && n.test.value)
let counts = { total: 0, loopTest: 0, exitSingle: 0, exitMulti: 0, other: 0 }
let examples = []
let byFile = new Map()
for (let s of report.skipped) {
  if (s.rule !== 'loop-running') continue
  if (!byFile.has(s.file)) byFile.set(s.file, [])
  byFile.get(s.file).push(s)
}
for (let [file, skips] of byFile) {
  let text = readFileSync(path.join(root, file), 'utf8')
  let { program } = parseSync(file, text)
  let found = new Map()
  walk(program, (node, parents) => {
    for (let s of skips) {
      if (node.start === s.start && node.end === s.end && !found.has(s)) found.set(s, parents)
    }
  })
  for (let s of skips) {
    counts.total++
    let parents = found.get(s)
    if (!parents) { counts.other++; continue }
    let ifIndex = parents.findLastIndex(p => p.type === 'IfStatement')
    let loopIndex = parents.findLastIndex(p => ['ForStatement', 'WhileStatement', 'DoWhileStatement'].includes(p.type))
    if (loopIndex > ifIndex) { counts.loopTest++; continue }
    let loop = parents.slice(0, ifIndex).findLast(p => isEndless(p))
    if (!loop) { counts.other++; continue }
    let exits = 0
    walk(loop.body, (node, ps) => {
      if (ps.some(isFunction)) return
      if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') exits++
      if (node.type === 'BreakStatement' && !node.label) {
        let inner = ps.findLast(p => ['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForOfStatement', 'ForInStatement', 'SwitchStatement'].includes(p.type))
        if (!inner) exits++
      }
    })
    if (exits >= 2) { counts.exitMulti++; examples.push(`${file}:${s.line} exits=${exits} ${s.original.replaceAll('\n', ' ').slice(0, 60)} -> ${s.replacement.slice(0, 30)}`) }
    else counts.exitSingle++
  }
}
console.log(JSON.stringify(counts))
for (let e of examples.slice(0, 25)) console.log('  ' + e)
