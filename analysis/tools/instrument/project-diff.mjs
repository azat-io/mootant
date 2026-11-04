// I2/I3 differential runs of a real Vitest project, without mootant's adapter.
//
// Usage:
//   node project-diff.mjs --project <dir> --paths src[,lib] --out <json>
//        --mode i2|i3 [--sample 200 --seed 1] [--ids id1,id2] [--workers 2]
//        [--vitest-args "..."] [--bin <mootant bin>] [--preset strict]
//
// The project's own files are modified in place and always restored.
//
// i2: runs the suite (1) on the original files, (2) with every mutated file
//     replaced by its switched text and no runtime, (3) switched with a mutant
//     runtime whose active mutant is null. Per-test outcomes must be equal.
// i3: for a seeded sample of pending mutants, compares per-test outcomes of
//     (p) the physically applied mutant (raw replacement, other files
//     original) and (s) every file switched with the runtime's active mutant
//     set before any module loads (NODE_OPTIONS --import of a setup that uses
//     mootant's own installMutantRuntime). Differences are re-run once.
//     Only the test files `vitest related <mutated file>` selects are run.

import { writeFileSync, readFileSync, rmSync, mkdtempSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'

import { listMutants, groupByFile, importDist, MOOTANT_ROOT, applyRaw, sample } from './lib.mjs'

let argv = process.argv.slice(2)
let flags = new Map()
for (let index = 0; index < argv.length; index += 2) flags.set(argv[index].replace(/^--/u, ''), argv[index + 1])
let project = path.resolve(flags.get('project'))
let paths = flags.get('paths').split(',')
let out = flags.get('out')
let mode = flags.get('mode')
let workers = flags.get('workers') ?? '2'
let preset = flags.get('preset') ?? 'strict'
let bin = flags.get('bin') ?? path.join(MOOTANT_ROOT, 'bin/mootant.js')
let extraArgs = (flags.get('vitest-args') ?? '').split(' ').filter(Boolean)
let timeoutMs = Number(flags.get('timeout') ?? 120_000)
let vitestBin = path.join(path.dirname(createRequire(path.join(project, 'package.json')).resolve('vitest/package.json')), 'vitest.mjs')
let mirror = flags.get('mirror') ?? null
function findMirror(file) {
  let relative = path.relative(project, file).replace(/\.[cm]?[jt]sx?$/u, '')
  for (let extension of ['.test.ts', '.test.js', '.test.tsx']) {
    let candidate = path.join(project, mirror, relative + extension)
    if (existsSync(candidate)) return path.relative(project, candidate)
  }
  return null
}

let { instrumentFile } = await importDist('core/instrument/instrument-file.js')
let { loadVueCompiler } = await importDist('core/parser/load-vue-compiler.js')
let { loadSvelteCompiler } = await importDist('core/parser/load-svelte-compiler.js')
// Same compilers mootant passes to createSwitchedFiles (core/run-mutants.ts:390).
let compilers = { vue: await loadVueCompiler(), svelte: await loadSvelteCompiler() }
let tmp = mkdtempSync(path.join(os.tmpdir(), 'project-diff-'))
let setup = path.join(tmp, 'setup.mjs')
writeFileSync(setup, `
let active = process.env.DIFF_ACTIVE
if (active !== undefined && active !== 'none') {
  let { installMutantRuntime } = await import(${JSON.stringify(pathToFileURL(path.join(MOOTANT_ROOT, 'dist/core/runtime/install-mutant-runtime.js')).href)})
  let runtime = installMutantRuntime()
  runtime.active = active === 'null' ? null : active
}
`)

let report = listMutants({ cwd: project, paths, bin, preset })
let pending = report.mutants.filter(mutant => mutant.status === 'Pending')
let byFile = groupByFile(pending)
let originals = new Map()
let switchedTexts = new Map()
for (let [display, mutants] of byFile) {
  let absolute = path.join(project, display)
  let source = readFileSync(absolute, 'utf8')
  originals.set(absolute, source)
  switchedTexts.set(absolute, instrumentFile({ mutants, source, file: display, compilers }))
}

function restore() {
  for (let [absolute, source] of originals) writeFileSync(absolute, source)
}
process.on('exit', restore)
process.on('SIGINT', () => { restore(); process.exit(130) })
process.on('SIGTERM', () => { restore(); process.exit(143) })

function writeAll(kind, except = null) {
  for (let [absolute, source] of originals) {
    if (absolute === except?.absolute) writeFileSync(absolute, except.text)
    else writeFileSync(absolute, kind === 'switched' ? switchedTexts.get(absolute) : source)
  }
}

/**
 * Runs vitest in its own process group and returns per-test outcomes
 * { "file > name": status }. On timeout the whole group is killed (a mutant
 * that loops synchronously blocks a fork that Vitest's testTimeout cannot
 * stop) and the run is recorded as `<run>: timeout`.
 */
function runVitest({ active, related }) {
  let json = path.join(tmp, `r${Date.now()}${Math.random()}.json`)
  // --mirror <dir>: run only <dir>/<path without extension>.test.<ext> (one test
  // file per source file, as in mootant itself) instead of `vitest related`.
  let mirrored = mirror && related ? related.map(file => findMirror(file)).filter(Boolean) : null
  let selection = mirrored ? ['run', ...mirrored] : [related ? 'related' : 'run', ...(related ?? [])]
  let args = [vitestBin, ...selection, '--run', '--reporter=json', `--outputFile=${json}`, '--pool=forks', `--maxWorkers=${workers}`, '--testTimeout=10000', '--coverage.enabled=false', ...extraArgs]
  let started = Date.now()
  return new Promise(resolve => {
    let child = spawn(process.execPath, args, {
      env: { ...process.env, DIFF_ACTIVE: active, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${pathToFileURL(setup).href}`.trim(), FORCE_COLOR: '0' },
      stdio: ['ignore', 'ignore', 'pipe'],
      cwd: project,
      detached: true,
    })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000) })
    let timedOut = false
    let killGroup = () => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }
    let timer = setTimeout(() => { timedOut = true; killGroup() }, timeoutMs)
    child.on('close', code => {
      clearTimeout(timer)
      killGroup()
      let ms = Date.now() - started
      let outcomes = {}
      let ok = true
      try {
        if (timedOut) throw new Error('timeout')
        let parsed = JSON.parse(readFileSync(json, 'utf8'))
        for (let file of parsed.testResults) {
          let relative = path.relative(project, file.name)
          if (file.status === 'failed' && file.assertionResults.length === 0) outcomes[`${relative} > <load>`] = 'failed'
          for (let test of file.assertionResults) outcomes[`${relative} > ${test.fullName}`] = test.status
        }
      } catch {
        ok = false
        outcomes['<run>'] = timedOut ? 'timeout' : `exit:${code}`
      }
      rmSync(json, { force: true })
      resolve({ ok, ms, outcomes, stderr: ok ? '' : stderr.slice(-2000) })
    })
  })
}

function diff(left, right) {
  let keys = new Set([...Object.keys(left), ...Object.keys(right)])
  let changes = []
  for (let key of keys) if (left[key] !== right[key]) changes.push({ test: key, left: left[key] ?? null, right: right[key] ?? null })
  return changes
}

function failedSet(outcomes) {
  return Object.entries(outcomes).filter(([, status]) => status !== 'passed' && status !== 'skipped' && status !== 'pending' && status !== 'todo').map(([key]) => key).sort()
}

let result = { project, paths, mode, preset, files: byFile.size, pending: pending.length, startedAt: new Date().toISOString() }
try {
  if (mode === 'i2') {
    writeAll('original')
    let base = await runVitest({ active: 'none' })
    writeAll('switched')
    let plain = await runVitest({ active: 'none' })
    let nulled = await runVitest({ active: 'null' })
    result.i2 = {
      tests: Object.keys(base.outcomes).length,
      baseFailed: failedSet(base.outcomes),
      ms: { base: base.ms, plain: plain.ms, nulled: nulled.ms },
      plainDiff: diff(base.outcomes, plain.outcomes),
      nullDiff: diff(base.outcomes, nulled.outcomes),
      errors: [base, plain, nulled].filter(run => !run.ok).map(run => run.stderr),
    }
  } else if (mode === 'i3') {
    let ids = flags.get('ids')?.split(',')
    let candidates = mirror ? pending.filter(mutant => findMirror(path.join(project, mutant.file)) !== null) : pending
    let chosen = ids ? candidates.filter(mutant => ids.includes(mutant.id)) : sample(candidates, Number(flags.get('sample') ?? 100), Number(flags.get('seed') ?? 1))
    let rows = []
    let count = 0
    for (let mutant of chosen) {
      let absolute = path.join(project, mutant.file)
      let related = [absolute]
      writeAll('original', { absolute, text: applyRaw(originals.get(absolute), mutant) })
      let physical = await runVitest({ active: 'none', related })
      writeAll('switched')
      let switched = await runVitest({ active: mutant.id, related })
      let changes = diff(physical.outcomes, switched.outcomes)
      let row = { id: mutant.id, file: mutant.file, line: mutant.line, mutator: mutant.mutator, kind: mutant.kind, original: mutant.original.slice(0, 160), replacement: mutant.replacement.slice(0, 160), physicalFailed: failedSet(physical.outcomes).length, switchedFailed: failedSet(switched.outcomes).length, tests: Object.keys(physical.outcomes).length, ms: physical.ms + switched.ms }
      if (changes.length > 0) {
        // Re-run both once: nondeterminism is not a switching bug.
        writeAll('original', { absolute, text: applyRaw(originals.get(absolute), mutant) })
        let physical2 = await runVitest({ active: 'none', related })
        writeAll('switched')
        let switched2 = await runVitest({ active: mutant.id, related })
        let changes2 = diff(physical2.outcomes, switched2.outcomes)
        row.changes = changes.slice(0, 20)
        row.confirmed = changes2.length > 0
        row.changes2 = changes2.slice(0, 20)
        row.flakyPhysical = diff(physical.outcomes, physical2.outcomes).length > 0
        row.flakySwitched = diff(switched.outcomes, switched2.outcomes).length > 0
      }
      rows.push(row)
      count++
      if (count % 10 === 0) {
        writeFileSync(out, JSON.stringify({ ...result, partial: true, rows }, null, 1))
        console.log(`${count}/${chosen.length} done, divergent so far: ${rows.filter(r => r.changes).length}`)
      }
    }
    result.i3 = {
      sampled: rows.length,
      killedPhysical: rows.filter(row => row.physicalFailed > 0).length,
      killedSwitched: rows.filter(row => row.switchedFailed > 0).length,
      divergent: rows.filter(row => row.changes).length,
      confirmed: rows.filter(row => row.confirmed).length,
    }
    result.rows = rows
  }
} finally {
  restore()
  rmSync(tmp, { recursive: true, force: true })
}
result.finishedAt = new Date().toISOString()
writeFileSync(out, JSON.stringify(result, null, 1))
console.log(JSON.stringify(result.i2 ? { ...result.i2, plainDiff: result.i2.plainDiff.length, nullDiff: result.i2.nullDiff.length, baseFailed: result.i2.baseFailed.length } : result.i3, null, 1))
