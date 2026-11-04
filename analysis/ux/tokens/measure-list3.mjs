import { readFileSync, writeFileSync } from 'node:fs'
import { count } from './count.mjs'
import { compactList2, toon } from './formats.mjs'
let verbose = JSON.parse(readFileSync('out/list-core-verbose.json', 'utf8'))
let slim = JSON.parse(readFileSync('/home/user/artifacts/list-core-skipped-170ec52.json', 'utf8'))
let same = verbose.mutants.every((m, i) => m.id === slim.mutants[i].id)
let text = compactList2(verbose) // uses exact original/replacement when present
writeFileSync('out/list-compact2-exact.txt', text)
let rows = [
  ['list --json --verbose (as printed)', readFileSync('out/list-core-verbose.json', 'utf8')],
  ['toon of list --json --verbose', toon(verbose)],
  ['compact v2, exact original/replacement', text],
].map(([name, t]) => ({ name, ...count(t) }))
console.log(JSON.stringify({ sameIds: same, rows }, null, 1))
