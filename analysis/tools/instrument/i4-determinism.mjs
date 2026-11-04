// I4: determinism of `mootant list`: same ids and texts on repeated runs, for
// another order of the paths, and from a subdirectory of the project.
//
// Usage: node i4-determinism.mjs <project-root> <out.json> <sub-dir> <path>...
//   <path>s are relative to the project root; <sub-dir> is a directory below
//   the root from which the same files are listed again.

import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { listMutants, MOOTANT_ROOT } from './lib.mjs'

let [root, out, sub, ...paths] = process.argv.slice(2)
let bin = path.join(MOOTANT_ROOT, 'bin/mootant.js')

function key(report) {
  return report.mutants
    .map(m => `${m.id}\t${m.file}\t${m.start}\t${m.end}\t${m.kind}\t${m.mutator}\t${m.status}\t${JSON.stringify(m.replacement)}`)
    .sort()
}
function compare(name, left, right) {
  let a = new Set(left)
  let b = new Set(right)
  let onlyLeft = left.filter(x => !b.has(x))
  let onlyRight = right.filter(x => !a.has(x))
  return { name, left: left.length, right: right.length, onlyLeft: onlyLeft.slice(0, 10), onlyRight: onlyRight.slice(0, 10), equal: onlyLeft.length === 0 && onlyRight.length === 0 }
}

let first = listMutants({ cwd: root, paths, bin, preset: 'strict' })
let second = listMutants({ cwd: root, paths, bin, preset: 'strict' })
let reversed = listMutants({ cwd: root, paths: [...paths].reverse(), bin, preset: 'strict' })
let fromSub = listMutants({ cwd: path.join(root, sub), paths: paths.map(p => path.relative(sub, p)), bin, preset: 'strict' })
let ids = report => report.mutants.map(m => m.id).sort()
let idsOnly = (name, a, b) => {
  let x = ids(a)
  let y = ids(b)
  return { name, equal: JSON.stringify(x) === JSON.stringify(y), left: x.length, right: y.length, sampleLeftFile: a.mutants[0]?.file, sampleRightFile: b.mutants[0]?.file }
}
let orderOf = report => report.mutants.map(m => m.id)
let result = {
  root,
  paths,
  sub,
  mutants: first.mutants.length,
  repeat: compare('repeat', key(first), key(second)),
  repeatOrder: JSON.stringify(orderOf(first)) === JSON.stringify(orderOf(second)),
  reversedPaths: compare('reversed paths', key(first), key(reversed)),
  reversedOrderSame: JSON.stringify(orderOf(first)) === JSON.stringify(orderOf(reversed)),
  fromSubdirectoryIds: idsOnly('ids from subdirectory', first, fromSub),
}
writeFileSync(out, JSON.stringify(result, null, 1))
console.log(JSON.stringify(result, null, 1))
