import { readFileSync, writeFileSync } from 'node:fs'
import { count } from './count.mjs'
import { compactList2 } from './formats.mjs'
let report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
let text = compactList2(report)
writeFileSync(process.argv[3] + '/list-compact2_mutants_only.txt', text)
console.log(JSON.stringify({ name: 'compact v2 mutants only', ...count(text) }))
