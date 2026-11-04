// Size and cost of the switched text of one file: mutants, `list --json`
// output, switched bytes, instrumentFile time, oxc transform time.
// Usage (in the project root): node switch-size.mjs <file> [--verbose]
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { importDist, loadVite, MOOTANT_ROOT } from './lib.mjs'
let [file, verbose] = process.argv.slice(2)
let t0 = Date.now()
let out = execFileSync(process.execPath, [path.join(MOOTANT_ROOT, 'bin/mootant.js'), 'list', file, '--json', '--verbose', ...(process.env.PRESET ? ['--preset', process.env.PRESET] : [])], { encoding: 'utf8', maxBuffer: 1 << 30 })
let t1 = Date.now()
let report = JSON.parse(out)
let { instrumentFile } = await importDist('core/instrument/instrument-file.js')
let source = readFileSync(file, 'utf8')
let mutants = report.mutants.filter(m => m.status === 'Pending')
let byMutator = {}
for (let m of mutants) byMutator[m.mutator] = (byMutator[m.mutator] ?? 0) + 1
let t2 = Date.now()
let switched = instrumentFile({ mutants, source, file })
let t3 = Date.now()
let { transformWithOxc } = await loadVite()
let t4 = Date.now()
let res = await transformWithOxc(switched, file.replace(/\.js$/u, '.ts'))
let t5 = Date.now()
console.log(JSON.stringify({ file, sourceBytes: source.length, mutants: mutants.length, byMutator, listVerboseJsonBytes: out.length, listMs: t1 - t0, switchedBytes: switched.length, growth: +(switched.length / source.length).toFixed(1), instrumentMs: t3 - t2, oxcTransformMs: t5 - t4, transformedBytes: res.code.length, rssMB: Math.round(process.memoryUsage().rss / 2 ** 20) }))
