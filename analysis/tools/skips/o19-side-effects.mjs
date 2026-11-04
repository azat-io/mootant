// Counts O19/R4 skips of statement-removal whose `if` test may have an effect.
// Usage: node o19-side-effects.mjs REPORT.json SOURCE_ROOT
// Needs oxc-parser; run with NODE_PATH pointing at a node_modules that has it.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

let require = createRequire(path.join(process.env.OXC_FROM ?? process.cwd(), 'x.js'))
let { parseSync } = require('oxc-parser')
let [reportPath, root] = process.argv.slice(2)
let report = JSON.parse(readFileSync(reportPath, 'utf8'))
let effectMethods = /^(delete|add|set|push|pop|shift|unshift|splice|next|exec|write|send|emit|save|remove|insert|clear|claim|take|consume|increment|decrement|acquire|tryAcquire|lock|register|unregister|dispatch|run|apply|call|resolve|reject|mark|visit|enter|leave|open|close|start|stop|update|record|track|use|read|load|fetch|request)$/u
let byFile = new Map()
for (let skip of report.skipped) {
  if (skip.mutator !== 'statement-removal' || (skip.rule !== 'O19' && skip.rule !== 'R4')) continue
  if (!byFile.has(skip.file)) byFile.set(skip.file, [])
  byFile.get(skip.file).push(skip)
}
let counts = { total: 0, withCall: 0, withEffectCall: 0, withAssignOrUpdate: 0, await: 0 }
let examples = []
function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return
  visit(node, parent)
  for (let key of Object.keys(node)) {
    if (key === 'parent') continue
    let value = node[key]
    if (Array.isArray(value)) value.forEach(child => child && typeof child.type === 'string' && walk(child, visit, node))
    else if (value && typeof value.type === 'string') walk(value, visit, node)
  }
}
for (let [file, skips] of byFile) {
  let text = readFileSync(path.join(root, file), 'utf8')
  let { program } = parseSync(file, text)
  let ifs = []
  walk(program, node => { if (node.type === 'IfStatement' && !node.alternate) ifs.push(node) })
  for (let skip of skips) {
    counts.total++
    let owner = ifs.find(node => {
      let c = node.consequent
      let body = c.type === 'BlockStatement' && c.body.length === 1 ? c.body[0] : c
      return body.start === skip.start
    })
    if (!owner) continue
    let info = { call: false, effectCall: false, assign: false, await: false, names: [] }
    walk(owner.test, node => {
      if (node.type === 'CallExpression' || node.type === 'NewExpression') {
        info.call = true
        let callee = node.callee
        let name = callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : callee.type === 'Identifier' ? callee.name : null
        if (name) info.names.push(name)
        if (name && effectMethods.test(name)) info.effectCall = true
      }
      if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') info.assign = true
      if (node.type === 'AwaitExpression') info.await = true
    })
    if (info.call) counts.withCall++
    if (info.effectCall) counts.withEffectCall++
    if (info.assign) counts.withAssignOrUpdate++
    if (info.await) counts.await++
    if (info.effectCall || info.assign || info.await) {
      examples.push(`${file}:${skip.line} ${skip.rule} if (${text.slice(owner.test.start, owner.test.end).replaceAll('\n', ' ').slice(0, 80)}) ${skip.original.replaceAll('\n', ' ').slice(0, 50)}`)
    }
  }
}
console.log(JSON.stringify(counts))
for (let example of examples) console.log('  ' + example)
