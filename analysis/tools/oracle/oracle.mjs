#!/usr/bin/env node
// Independent oracle for Mootant verdicts: applies every mutant physically to
// a copy of the project and runs the project's own test command, without any
// instrumentation, then records killed / survived / timeout.
//
// Usage:
//   node oracle.mjs --project <dir> --report <mootant.json> --out <results.jsonl>
//        [--cmd "<test command>"] [--workers 2] [--timeout-factor 4]
//        [--min-timeout 20000] [--ids id1,id2] [--variant auto|raw|paren]
//        [--work <dir>] [--keep] [--env K=V ...]
//
// <mootant.json> is the output of `mootant run ... --json --all --verbose`
// (statuses are copied into the results) or `mootant list ... --json --verbose`.
// The command may contain `{json}`, replaced by a temp file path (e.g. for
// `vitest run --reporter=json --outputFile={json}`), which is parsed to list the
// failed tests. Without --cmd: `npx vitest run --reporter=json
// --outputFile={json}` when vitest is installed, else `node --test`.
//
// Every worker gets a copy of the project (without node_modules, which is
// symlinked) that is a git repository; after every mutant the copy is reset
// with `git checkout` + `git clean`, so snapshot files, caches and temp files a
// run wrote never leak into the next run. Results are appended to --out as JSON
// lines, so an interrupted run resumes where it stopped.
//
// Expression mutants: Mootant's instrumenter evaluates `(replacement)` in
// place of the original range. The raw replacement text can parse with a
// different precedence (e.g. `a && b && c` -> `a || b && c`). With --variant
// auto (default) both the raw and the parenthesized text are parsed with
// oxc-parser (preserveParens: false); when their ASTs differ and the range does
// not start a statement, the parenthesized text is used and the result is
// flagged `precedence: true`.

import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

let args = parseArgs(process.argv.slice(2))
if (!args.project || !args.report || !args.out) {
  console.error('usage: oracle.mjs --project <dir> --report <json> --out <jsonl> [options]')
  process.exit(2)
}
let project = path.resolve(args.project)
let report = JSON.parse(fs.readFileSync(args.report, 'utf8'))
let workers = Number(args.workers ?? 2)
let timeoutFactor = Number(args['timeout-factor'] ?? 4)
let minTimeout = Number(args['min-timeout'] ?? 20000)
let variantMode = args.variant ?? 'auto'
let extraEnv = Object.fromEntries((args.env ?? []).map(entry => {
  let index = entry.indexOf('=')
  return [entry.slice(0, index), entry.slice(index + 1)]
}))
let command = args.cmd ?? detectCommand(project)
let workRoot = path.resolve(args.work ?? path.join(path.dirname(project), `.oracle-${path.basename(project)}`))

let oxc = await loadOxc()

let mutants = (report.mutants ?? [])
  .filter(mutant => mutant.status !== 'Ignored')
  .filter(mutant => !args.ids || args.ids.split(',').some(id => mutant.id.startsWith(id)))
let done = new Set()
if (fs.existsSync(args.out)) {
  for (let line of fs.readFileSync(args.out, 'utf8').split('\n')) {
    if (line.trim()) {
      done.add(JSON.parse(line).id)
    }
  }
}
let queue = mutants.filter(mutant => !done.has(mutant.id))
log(`project ${project}`)
log(`command: ${command}`)
log(`${mutants.length} mutants, ${queue.length} left, ${workers} workers`)

let copies = []
for (let index = 0; index < Math.min(workers, Math.max(1, queue.length)); index++) {
  copies.push(prepareCopy(index))
}

let baseline = []
for (let copy of copies) {
  let first = await runCommand(copy, 10 * 60_000)
  if (first.code !== 0) {
    console.error(first.tail)
    throw new Error(`baseline fails in ${copy} (exit ${first.code})`)
  }
  baseline.push(first.duration)
  resetCopy(copy)
}
let timeout = Math.max(minTimeout, Math.ceil(timeoutFactor * Math.max(...baseline)))
log(`baseline ${baseline.map(ms => Math.round(ms)).join(', ')} ms; timeout ${timeout} ms`)

let output = fs.openSync(args.out, 'a')
let finished = 0
await Promise.all(copies.map(async copy => {
  while (queue.length > 0) {
    let mutant = queue.shift()
    let result = await runMutant(copy, mutant)
    fs.writeSync(output, `${JSON.stringify(result)}\n`)
    finished += 1
    log(`[${finished}/${mutants.length - done.size}] ${mutant.id.slice(0, 8)} ${mutant.file}:${mutant.line} mootant=${mutant.status ?? '-'} oracle=${result.oracle}${result.precedence ? ' (paren)' : ''} ${Math.round(result.duration)}ms`)
  }
}))
fs.closeSync(output)
if (!args.keep) {
  for (let copy of copies) {
    fs.rmSync(copy, { recursive: true, force: true })
  }
}

/**
 * Applies one mutant to the copy, runs the tests and resets the copy.
 */
async function runMutant(copy, mutant) {
  let file = path.join(copy, mutant.file)
  let source = fs.readFileSync(file, 'utf8')
  let built = buildMutatedText(source, mutant, file)
  let base = {
    id: mutant.id,
    file: mutant.file,
    line: mutant.line,
    mutator: mutant.mutator,
    original: mutant.original,
    replacement: mutant.replacement,
    mootant: mutant.status ?? null,
    mootantCause: mutant.cause ?? null,
    killedBy: mutant.killedBy ?? null,
    killedIn: mutant.killedIn ?? null,
    precedence: built.precedence,
    variant: built.variant,
  }
  if (built.error) {
    return { ...base, oracle: 'invalid', error: built.error, duration: 0 }
  }
  fs.writeFileSync(file, built.text)
  try {
    let run = await runCommand(copy, timeout)
    return {
      ...base,
      oracle: classify(run),
      code: run.code,
      signal: run.signal,
      timedOut: run.timedOut,
      duration: run.duration,
      failed: run.failed,
      tail: run.code === 0 ? undefined : run.tail.slice(-3000),
    }
  } finally {
    resetCopy(copy)
  }
}

/**
 * Classifies a run of the test command.
 */
function classify(run) {
  if (run.timedOut) {
    return 'timeout'
  }
  if (run.code === 0) {
    return 'survived'
  }
  if (/Test timed out in|Hook timed out in|testTimeoutFailure|timed out after/u.test(run.tail)) {
    return 'killed-timeout'
  }
  return 'killed'
}

/**
 * Builds the mutated text of a file.
 */
function buildMutatedText(source, mutant, file) {
  let { start, end, original, replacement } = mutant
  if (source.slice(start, end) !== original) {
    let bytes = Buffer.from(source)
    let slice = bytes.subarray(start, end).toString()
    if (slice !== original) {
      return { error: `original text not found at ${start}-${end}` }
    }
    let prefix = bytes.subarray(0, start).toString()
    start = prefix.length
    end = start + original.length
  }
  let raw = source.slice(0, start) + replacement + source.slice(end)
  if (mutant.kind === 'block' || variantMode === 'raw' || oxc === null) {
    return { text: raw, variant: 'raw', precedence: false }
  }
  let paren = `${source.slice(0, start)}(${replacement})${source.slice(end)}`
  if (variantMode === 'paren') {
    return { text: paren, variant: 'paren', precedence: false }
  }
  let rawAst = parse(file, raw)
  let parenAst = parse(file, paren)
  if (rawAst === null && parenAst !== null) {
    return { text: paren, variant: 'paren', precedence: true }
  }
  if (rawAst === null || parenAst === null || rawAst === parenAst) {
    return { text: raw, variant: 'raw', precedence: false }
  }
  if (startsStatement(file, source, start)) {
    return { text: raw, variant: 'raw', precedence: false }
  }
  return { text: paren, variant: 'paren', precedence: true }
}

/**
 * Parses a file with oxc-parser without parentheses and positions.
 */
function parse(file, text) {
  try {
    let result = oxc.parseSync(file, text, { preserveParens: false })
    if (result.errors.length > 0) {
      return null
    }
    return JSON.stringify(result.program, (key, value) =>
      key === 'start' || key === 'end' || key === 'range' || key === 'loc' ? undefined : value,
    )
  } catch {
    return null
  }
}

/**
 * Tells whether a statement starts at the offset in the original file.
 */
function startsStatement(file, text, offset) {
  let result = oxc.parseSync(file, text, { preserveParens: true })
  let found = false
  JSON.stringify(result.program, (key, value) => {
    if (value && typeof value === 'object' && typeof value.type === 'string' &&
      value.type.endsWith('Statement') && value.start === offset) {
      found = true
    }
    return value
  })
  return found
}

/**
 * Runs the test command in a copy with a deadline.
 */
function runCommand(copy, limit) {
  return new Promise(resolve => {
    let jsonFile = path.join(os.tmpdir(), `oracle-${process.pid}-${path.basename(copy)}-${Date.now()}.json`)
    let text = command.replaceAll('{json}', jsonFile)
    let started = performance.now()
    let child = spawn(text, {
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      shell: true,
      cwd: copy,
    })
    let tail = ''
    let append = chunk => {
      tail = (tail + chunk.toString()).slice(-20000)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    let timedOut = false
    let timer = setTimeout(() => {
      timedOut = true
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {}
    }, limit)
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {}
      let failed = readFailed(jsonFile, tail)
      fs.rmSync(jsonFile, { force: true })
      resolve({ duration: performance.now() - started, code, signal, timedOut, tail, failed })
    })
  })
}

/**
 * Lists failed tests from a Vitest JSON report, or from TAP output.
 */
function readFailed(jsonFile, tail) {
  if (fs.existsSync(jsonFile)) {
    try {
      let json = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
      let failed = []
      for (let file of json.testResults ?? []) {
        let name = path.relative(workRoot, file.name).split(path.sep).slice(1).join('/')
        if (file.status === 'failed' && (file.assertionResults ?? []).every(test => test.status !== 'failed')) {
          failed.push(`${name} (file: ${String(file.message ?? '').split('\n')[0].slice(0, 200)})`)
        }
        for (let test of file.assertionResults ?? []) {
          if (test.status === 'failed') {
            failed.push(`${name} > ${test.fullName}`)
          }
        }
      }
      return failed
    } catch {
      return null
    }
  }
  let failed = []
  for (let line of tail.split('\n')) {
    let match = /^\s*not ok \d+ - (.*)$/u.exec(line)
    if (match) {
      failed.push(match[1])
    }
  }
  return failed
}

/**
 * Creates a worker copy of the project that is a git repository.
 */
function prepareCopy(index) {
  let copy = path.join(workRoot, `w${index}`)
  fs.rmSync(copy, { recursive: true, force: true })
  fs.mkdirSync(copy, { recursive: true })
  fs.cpSync(project, copy, {
    recursive: true,
    filter: source => {
      let relative = path.relative(project, source)
      let first = relative.split(path.sep)[0]
      return first !== 'node_modules' && first !== '.git' && first !== '.mootant'
    },
  })
  if (fs.existsSync(path.join(project, 'node_modules'))) {
    fs.symlinkSync(path.join(project, 'node_modules'), path.join(copy, 'node_modules'))
  }
  let git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: copy, stdio: 'ignore' })
  git('init', '-q')
  fs.writeFileSync(path.join(copy, '.git', 'info', 'exclude'), 'node_modules\n')
  git('add', '-A')
  git('-c', 'user.email=oracle@example.com', '-c', 'user.name=oracle', 'commit', '-qm', 'base', '--no-verify')
  return copy
}

/**
 * Resets a copy to its first commit.
 */
function resetCopy(copy) {
  execFileSync('git', ['checkout', '-q', '--', '.'], { cwd: copy, stdio: 'ignore' })
  execFileSync('git', ['clean', '-fdxq', '-e', 'node_modules'], { cwd: copy, stdio: 'ignore' })
}

/**
 * Picks the test command of a project.
 */
function detectCommand(root) {
  let require = createRequire(path.join(root, 'package.json'))
  try {
    let manifest = require.resolve('vitest/package.json')
    let bin = path.join(path.dirname(manifest), 'vitest.mjs')
    return `${JSON.stringify(process.execPath)} ${JSON.stringify(bin)} run --reporter=dot --reporter=json --outputFile.json={json}`
  } catch {
    return 'node --test --test-reporter=tap'
  }
}

/**
 * Loads oxc-parser from the project or from the mootant checkout.
 */
async function loadOxc() {
  for (let from of [path.join(project, 'package.json'), '/home/user/wt/base/package.json']) {
    try {
      let resolved = createRequire(from).resolve('oxc-parser')
      return await import(pathToFileURL(resolved).href)
    } catch {}
  }
  return null
}

function parseArgs(list) {
  let parsed = {}
  for (let index = 0; index < list.length; index++) {
    let key = list[index].replace(/^--/u, '')
    if (key === 'keep') {
      parsed.keep = true
      continue
    }
    let value = list[++index]
    if (key === 'env') {
      parsed.env = [...(parsed.env ?? []), value]
    } else {
      parsed[key] = value
    }
  }
  return parsed
}

function log(message) {
  console.error(`[oracle ${new Date().toISOString().slice(11, 19)}] ${message}`)
}
