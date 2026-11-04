// Lists the mootant dist modules whose functions ran, per process, from a
// NODE_V8_COVERAGE directory. Usage: node v8-modules.mjs <coverage-dir> <out.json>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

let [directory, out] = process.argv.slice(2)
let processes = []
for (let name of readdirSync(directory)) {
  if (!name.endsWith('.json')) continue
  let data = JSON.parse(readFileSync(path.join(directory, name), 'utf8'))
  let modules = {}
  let kind = 'other'
  for (let script of data.result) {
    let url = script.url
    let at = url.indexOf('/node_modules/mootant/dist/')
    if (at === -1) {
      if (url.includes('/vitest/dist/workers/forks')) kind = 'vitest-worker'
      continue
    }
    let file = url.slice(at + '/node_modules/mootant/dist/'.length)
    let ran = script.functions
      .filter(fn => fn.ranges[0].count > 0 && fn.functionName !== '')
      .map(fn => fn.functionName)
    if (ran.length > 0 || script.functions[0]?.ranges[0].count > 0) {
      modules[file] = [...new Set(ran)].sort()
    }
  }
  let files = Object.keys(modules)
  if (files.some(file => file.startsWith('cli/'))) kind = 'main'
  else if (files.includes('adapters/vitest/runner.js')) kind = 'vitest-worker'
  else if (files.some(file => file.startsWith('adapters/node-test/preload/'))) kind = 'node-test-process'
  if (files.length > 0) processes.push({ name, kind, modules })
}
writeFileSync(out, JSON.stringify(processes, null, 2))
for (let entry of processes) {
  console.log(entry.kind, entry.name, Object.keys(entry.modules).length)
}
