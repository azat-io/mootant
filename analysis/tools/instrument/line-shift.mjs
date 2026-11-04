// Line shift of switched files: how far the code of a file moves down in the
// switched text, which Vitest is told maps 1:1 to the original (`map: null` in
// adapters/vitest/create-mootant-plugin.ts:49) and node:test serves as is.
//
// Usage: node line-shift.mjs <project-root> <out.json> <path>... [--preset strict]

import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { listMutants, groupByFile, importDist, MOOTANT_ROOT, read } from './lib.mjs'

let args = process.argv.slice(2)
let preset = 'recommended'
let presetIndex = args.indexOf('--preset')
if (presetIndex !== -1) {
  preset = args[presetIndex + 1]
  args.splice(presetIndex, 2)
}
let [root, out, ...paths] = args
let { instrumentFile } = await importDist('core/instrument/instrument-file.js')
let report = listMutants({ cwd: root, paths, bin: path.join(MOOTANT_ROOT, 'bin/mootant.js'), preset })
let files = []
let byMutator = {}
for (let [display, mutants] of groupByFile(report.mutants.filter(m => m.status === 'Pending'))) {
  let source = read(path.join(root, display))
  let switched = instrumentFile({ mutants, source, file: display })
  let originalLines = source.split('\n').length
  let switchedLines = switched.split('\n').length
  let multi = mutants.filter(m => m.replacement.includes('\n'))
  for (let m of multi) byMutator[m.mutator] = (byMutator[m.mutator] ?? 0) + m.replacement.split('\n').length - 1
  // Lines of the original whose position moves: lines after the first multi-line replacement.
  let firstShiftLine = multi.length > 0 ? Math.min(...multi.map(m => m.line)) : null
  let movedLines = firstShiftLine === null ? 0 : originalLines - firstShiftLine
  files.push({ file: display, mutants: mutants.length, originalLines, switchedLines, shift: switchedLines - originalLines, movedLines, multiLineMutants: multi.length })
}
let shifted = files.filter(f => f.shift > 0)
let totalLines = files.reduce((s, f) => s + f.originalLines, 0)
let movedLines = files.reduce((s, f) => s + f.movedLines, 0)
let summary = {
  root, paths, preset,
  files: files.length,
  filesWithShift: shifted.length,
  shareFilesWithShift: +(shifted.length / files.length).toFixed(3),
  shareLinesMoved: +(movedLines / totalLines).toFixed(3),
  medianShiftOfShifted: shifted.map(f => f.shift).sort((a, b) => a - b)[Math.floor(shifted.length / 2)] ?? 0,
  maxShift: files.reduce((m, f) => (f.shift > m.shift ? f : m), { shift: 0 }),
  extraLinesByMutator: byMutator,
}
writeFileSync(out, JSON.stringify({ summary, files }, null, 1))
console.log(JSON.stringify(summary, null, 1))
