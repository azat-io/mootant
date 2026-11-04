#!/usr/bin/env node
// Section 3, "Эмпирическая проверка": compares the mutants and verdicts of
// Mootant and StrykerJS on the bench projects of section 4.
//
// Inputs (read only):
//   $BENCH_RESULTS/<project>/m-cold/run-{1,2,3}.json  mootant run --json --all --verbose
//   $BENCH_RESULTS/<project>/s-cold/run-{1,2,3}.json  Stryker JSON report (sources included)
//   $BENCH_RESULTS/<project>/{m-cold,s-cold}/hyperfine.json, run-k.out, run-k.err
//   $BENCH_RESULTS/<project>/m-cold/run-1.units.json   unit trace (analysis/bench/lib/trace-units.mjs)
//   lists/<project>-list.json ($LISTS)                mootant list <MUTATE> --json --verbose --skipped
//   oxc-parser 0.156.0, the parser of Mootant 170ec52 (from a bench copy; $OXC_PARSER)
//   review.json (this directory)                      manual review of the sample, if present
// Outputs (this directory):
//   summary.json                 per project: counts, determinism, matching, classes, timing
//   <project>-stryker.csv        one row per Stryker mutant (run 1) with its match
//   <project>-mootant.csv        one row per Mootant mutant (run 1) with its match
//   stryker-useful.csv           Stryker Survived/NoCoverage of all projects, classes (a)/(b)/(c)
//   mootant-only-useful.csv      Mootant Survived/NoCoverage without a Stryker counterpart
//   verdict-disagreements.csv    matched pairs whose verdicts differ (useful vs not)
//   sample.csv                   stratified sample for the manual review (seed below)
//   review.csv                   review.json joined with the data (when review.json exists)
//   tables.mjs prints the Markdown tables of the report from these files.
//
// Matching. Both tools' mutants and Mootant's skipped candidates become an edit
// of the file text (offsets: Mootant start/end are UTF-16 offsets; Stryker
// locations are 1-based lines and 1-based columns, end exclusive), trimmed to
// the characters that change. The top-level statement holding the edit is
// parsed with the edit applied, and its AST is serialised without positions,
// parentheses, comments, raw literal text, empty statements and with
// expression-free templates as strings. "exact" = same file, same top-level
// statement, same serialised AST: the two mutants produce the same program up
// to formatting. "approx" = equal only after one named rewrite of the Stryker
// mutant (see APPROX below); these are the uncertain pairs.
//
// Usage: node compare.mjs [project...]   (default: every project with both runs)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const RESULTS = process.env.BENCH_RESULTS ?? '/home/user/projects/bench/results'
// `mootant list <MUTATE> --json --verbose --skipped` of each project, copied
// here from /home/user/projects/competitors (one run per project, same tarball).
const LISTS = process.env.LISTS ?? path.join(HERE, 'lists')
const BENCH = process.env.BENCH_PROJECTS ?? '/home/user/projects/bench'
const OUT = process.env.OUT ?? HERE
const PROJECTS = ['perfectionist', 'path-to-regexp', 'cheerio', 'fast-json-stringify']
const SEED = 20261104

const USEFUL = new Set(['Survived', 'NoCoverage'])
const isUseful = status => USEFUL.has(status)

// oxc-parser: the copy Mootant itself uses in a bench project (npm layout).
function loadOxc() {
  let candidates = [
    process.env.OXC_PARSER,
    ...['cheerio', 'path-to-regexp', 'fast-json-stringify'].map(p => `${BENCH}/${p}/node_modules/oxc-parser/package.json`),
  ].filter(Boolean)
  for (let candidate of candidates) {
    if (!existsSync(candidate)) continue
    let require = createRequire(candidate)
    return { oxc: require(require.resolve('oxc-parser')), from: path.dirname(candidate), version: require('oxc-parser/package.json').version }
  }
  throw new Error('oxc-parser not found; set OXC_PARSER=<path>/oxc-parser/package.json')
}
const { oxc, from: OXC_FROM, version: OXC_VERSION } = loadOxc()

const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const lineStarts = text => {
  let starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return starts
}
const position = (starts, offset) => {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    let mid = (lo + hi + 1) >> 1
    if (starts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return { line: lo + 1, column: offset - starts[lo] + 1 }
}
const sha1 = text => createHash('sha1').update(text).digest('hex').slice(0, 16)

// Edit trimmed to the changed characters: [s, e) of the file becomes `ins`.
function trimEdit(source, start, end, replacement) {
  let original = source.slice(start, end)
  let p = 0
  while (p < original.length && p < replacement.length && original[p] === replacement[p]) p++
  let q = 0
  while (
    q < original.length - p &&
    q < replacement.length - p &&
    original[original.length - 1 - q] === replacement[replacement.length - 1 - q]
  )
    q++
  return { s: start + p, e: end - q, ins: replacement.slice(p, replacement.length - q) }
}

// ---- AST canonicalisation -------------------------------------------------

const SKIP_KEYS = new Set(['start', 'end', 'range', 'loc', 'raw', 'extra', 'comments'])
function canon(node) {
  if (node === null || node === undefined) return '_'
  if (Array.isArray(node)) {
    let parts = []
    for (let item of node) if (!(item && item.type === 'EmptyStatement')) parts.push(canon(item))
    return `[${parts.join(',')}]`
  }
  if (typeof node !== 'object') return JSON.stringify(node)
  if (node instanceof RegExp) return `R${node.source}/${node.flags}`
  switch (node.type) {
    case 'ParenthesizedExpression':
      return canon(node.expression)
    case 'Literal':
      if (node.regex) return `R(${node.regex.pattern}/${node.regex.flags})`
      if (node.bigint !== undefined && node.bigint !== null) return `B(${node.bigint})`
      return `L(${typeof node.value}:${typeof node.value === 'number' ? String(node.value) : JSON.stringify(node.value)})`
    case 'TemplateLiteral':
      if (node.expressions.length === 0) return `L(string:${JSON.stringify(node.quasis[0].value.cooked)})`
      break
    case 'TemplateElement':
      return `Q(${JSON.stringify(node.value.cooked)})`
  }
  let keys = Object.keys(node).filter(k => !SKIP_KEYS.has(k)).sort()
  return `{${keys.map(k => `${k}:${canon(node[k])}`).join(';')}}`
}

function parse(file, text) {
  let lang = /\.[cm]?tsx?$/.test(file) ? (file.endsWith('x') ? 'tsx' : 'ts') : file.endsWith('x') ? 'jsx' : 'js'
  let name = `chunk.${lang}`
  let result = oxc.parseSync(name, text, { sourceType: 'module', preserveParens: false, lang })
  if (result.errors.length > 0) {
    let script = oxc.parseSync(name, text, { sourceType: 'script', preserveParens: false, lang })
    if (script.errors.length === 0) return script
  }
  return result
}

// ---- Loading ----------------------------------------------------------------

function strykerOffsets(starts, location) {
  return {
    s: starts[location.start.line - 1] + location.start.column - 1,
    e: starts[location.end.line - 1] + location.end.column - 1,
  }
}

function loadRuns(dir) {
  let runs = []
  for (let k = 1; k <= 9; k++) {
    let file = path.join(dir, `run-${k}.json`)
    if (existsSync(file)) runs.push({ k, report: readJson(file) })
  }
  return runs
}

function hyperfine(dir) {
  let file = path.join(dir, 'hyperfine.json')
  if (!existsSync(file)) return null
  let text = readFileSync(file, 'utf8')
  if (!text.trim()) return null
  let r = JSON.parse(text).results[0]
  return { mean: r.mean, stddev: r.stddev, median: r.median, min: r.min, max: r.max, times: r.times, user: r.user, system: r.system }
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

function strykerLog(dir, k) {
  let file = path.join(dir, `run-${k}.out`)
  if (!existsSync(file)) return null
  let text = stripAnsi(readFileSync(file, 'utf8'))
  let time = s => {
    let m = /^(\d\d):(\d\d):(\d\d)/.exec(s)
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
  }
  let lines = text.split('\n')
  let first = lines.find(l => /^\d\d:\d\d:\d\d/.test(l))
  let initStart = lines.find(l => l.includes('Starting initial test run'))
  let initDone = lines.find(l => l.includes('Initial test run succeeded'))
  let done = lines.find(l => l.includes('Done in'))
  let tests = initDone ? /Ran (\d+) tests in ([^(]+)\(net ([\d.]+) ms, overhead ([\d.]+) ms\)/.exec(initDone) : null
  let staticWarn = lines.find(l => l.includes('static mutants'))
  return {
    setup: first && initStart ? time(initStart) - time(first) : null,
    initialRun: initStart && initDone ? time(initDone) - time(initStart) : null,
    mutation: initDone && done ? time(done) - time(initDone) : null,
    initialTests: tests ? Number(tests[1]) : null,
    initialNetMs: tests ? Number(tests[3]) : null,
    initialOverheadMs: tests ? Number(tests[4]) : null,
    staticWarning: staticWarn ? staticWarn.replace(/^.*WARN MutantTestPlanner\s*/, '').trim() : null,
  }
}

// ---- Per project --------------------------------------------------------------

function analyse(project) {
  let mDir = path.join(RESULTS, project, 'm-cold')
  let sDir = path.join(RESULTS, project, 's-cold')
  let mRuns = loadRuns(mDir)
  let sRuns = loadRuns(sDir)
  let listFile = path.join(LISTS, `${project}-list.json`)
  if (mRuns.length === 0 || sRuns.length === 0 || !existsSync(listFile)) return null
  let list = readJson(listFile)
  let notes = []

  // Sources: from the Stryker report; files Stryker did not report are read
  // from the bench copy and checked against Mootant's originals.
  let sources = new Map()
  for (let [file, entry] of Object.entries(sRuns[0].report.files)) sources.set(file, entry.source)
  let moo = mRuns[0].report.mutants
  for (let m of [...moo, ...(list.skipped ?? [])]) {
    if (sources.has(m.file)) continue
    let text = readFileSync(path.join(BENCH, project, m.file), 'utf8')
    sources.set(m.file, text)
    notes.push(`source of ${m.file} read from the bench copy (no Stryker mutants there)`)
  }
  let offsetMismatch = 0
  for (let m of [...moo, ...list.mutants, ...(list.skipped ?? [])]) {
    if (sources.get(m.file).slice(m.start, m.end) !== m.original) offsetMismatch++
  }

  // list ↔ run: same mutants
  let listIds = new Map(list.mutants.map(m => [m.id, m]))
  let listVsRun = { listMutants: list.mutants.length, runMutants: moo.length, missingInList: 0, differentEdit: 0 }
  for (let m of moo) {
    let l = listIds.get(m.id)
    if (!l) listVsRun.missingInList++
    else if (l.start !== m.start || l.end !== m.end || l.replacement !== m.replacement) listVsRun.differentEdit++
  }

  // Determinism of verdicts across runs.
  let mStatus = new Map()
  for (let { k, report } of mRuns) for (let m of report.mutants) {
    if (!mStatus.has(m.id)) mStatus.set(m.id, [])
    mStatus.get(m.id)[k - 1] = m.status
  }
  let sKey = (file, m) => `${file}|${m.location.start.line}:${m.location.start.column}-${m.location.end.line}:${m.location.end.column}|${m.mutatorName}|${m.replacement}`
  let sStatus = new Map()
  for (let { k, report } of sRuns) for (let [file, entry] of Object.entries(report.files)) for (let m of entry.mutants) {
    let key = sKey(file, m)
    if (!sStatus.has(key)) sStatus.set(key, [])
    sStatus.get(key)[k - 1] = m.status
  }
  const determinism = (map, runs) => {
    let differing = []
    for (let [key, list] of map) {
      let defined = list.filter(Boolean)
      if (defined.length !== runs || new Set(defined).size > 1) differing.push({ key, statuses: list })
    }
    return differing
  }
  let mDiff = determinism(mStatus, mRuns.length)
  let sDiff = determinism(sStatus, sRuns.length)
  let countStatuses = list => list.reduce((acc, s) => ((acc[s] = (acc[s] ?? 0) + 1), acc), {})
  let perRunCounts = (runs, extract) => runs.map(({ k, report }) => ({ run: k, ...countStatuses(extract(report)) }))
  let mCounts = perRunCounts(mRuns, r => r.mutants.map(m => m.status))
  let sCounts = perRunCounts(sRuns, r => Object.values(r.files).flatMap(f => f.mutants.map(m => m.status)))

  // ---- Entries ----
  let fileInfo = new Map()
  const info = file => {
    if (!fileInfo.has(file)) {
      let text = sources.get(file)
      let starts = lineStarts(text)
      let program = parse(file, text)
      if (program.errors.length > 0) notes.push(`${file}: ${program.errors.length} parse errors in the original`)
      let statements = program.program.body.map(st => ({ s: st.start, e: st.end }))
      fileInfo.set(file, { text, starts, statements, chunkCache: new Map() })
    }
    return fileInfo.get(file)
  }
  const chunkOf = (file, edit) => {
    let { statements } = info(file)
    let containing = statements.filter(st => st.s <= edit.s && edit.e <= st.e)
    if (containing.length > 0) return containing[0]
    let overlapping = statements.filter(st => st.s <= edit.e + 1 && edit.s - 1 <= st.e)
    if (overlapping.length > 0) return { s: Math.min(...overlapping.map(o => o.s)), e: Math.max(...overlapping.map(o => o.e)) }
    return { s: edit.s, e: edit.e }
  }
  const hashOf = (file, chunk, edit) => {
    let { text } = info(file)
    let mutated = text.slice(chunk.s, edit.s) + edit.ins + text.slice(edit.e, chunk.e)
    let result = parse(file, mutated)
    if (result.errors.length > 0) {
      return { hash: `ERR:${sha1(mutated.replace(/\s+/g, '').replace(/["`]/g, "'"))}`, parseError: true }
    }
    return { hash: sha1(canon(result.program.body)), parseError: false }
  }
  const originalHash = (file, chunk) => {
    let key = `${chunk.s}:${chunk.e}`
    let { chunkCache, text } = info(file)
    if (!chunkCache.has(key)) {
      let result = parse(file, text.slice(chunk.s, chunk.e))
      chunkCache.set(key, { hash: sha1(canon(result.program.body)), program: result.program })
    }
    return chunkCache.get(key)
  }
  const makeEntry = (base, start, end, replacement) => {
    let { text, starts } = info(base.file)
    let edit = trimEdit(text, start, end, replacement)
    let chunk = chunkOf(base.file, edit)
    let { hash, parseError } = hashOf(base.file, chunk, edit)
    let pos = position(starts, start)
    return {
      ...base,
      s: start,
      e: end,
      line: pos.line,
      column: pos.column,
      original: text.slice(start, end),
      replacement,
      edit,
      chunk,
      hash,
      parseError,
      identity: hash === originalHash(base.file, chunk).hash,
    }
  }

  let mEntries = moo.map(m =>
    makeEntry(
      {
        tool: 'mootant', id: m.id, file: m.file, mutator: m.mutator, status: m.status,
        statuses: mStatus.get(m.id), killedBy: m.killedBy?.name ?? null, killedIn: m.killedIn ?? null,
        message: m.message ?? null, cause: m.cause ?? null, isolatedBecause: m.isolatedBecause ?? null, scope: m.scope ?? null,
      },
      m.start, m.end, m.replacement,
    ),
  )
  let kEntries = (list.skipped ?? []).map((m, i) =>
    makeEntry(
      {
        tool: 'skipped', id: `skip-${i}`, file: m.file, mutator: m.mutator, status: null,
        category: m.category, rule: m.rule, heuristic: m.heuristic, reason: m.reason, by: m.by,
      },
      m.start, m.end, m.replacement,
    ),
  )
  let sEntries = []
  for (let [file, entry] of Object.entries(sRuns[0].report.files)) {
    let { starts } = info(file)
    for (let m of entry.mutants) {
      let { s, e } = strykerOffsets(starts, m.location)
      sEntries.push(
        makeEntry(
          {
            tool: 'stryker', id: m.id, file, mutator: m.mutatorName, status: m.status, statuses: sStatus.get(sKey(file, m)),
            static: m.static ?? null, coveredBy: m.coveredBy?.length ?? null, killedBy: m.killedBy?.length ?? null,
            statusReason: m.statusReason ?? null,
          },
          s, e, m.replacement,
        ),
      )
    }
  }

  // ---- Matching ----
  const keyOf = x => `${x.file}|${x.chunk.s}:${x.chunk.e}|${x.hash}`
  const index = entries => {
    let map = new Map()
    for (let x of entries) {
      let key = keyOf(x)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(x)
    }
    return map
  }
  let mIndex = index(mEntries)
  let kIndex = index(kEntries)

  // APPROX: rewrites of a Stryker mutant into the form Mootant would write
  // for the same change. Each match through them is counted as uncertain.
  const approxVariants = x => {
    let variants = []
    let { text } = info(x.file)
    if (x.mutator === 'StringLiteral' && /^(["'])Stryker was here!\1$/.test(x.replacement.trim())) {
      variants.push({ rule: 'filler-string', replacement: "'mootant'" })
    }
    if (x.mutator === 'ArrayDeclaration' && /^\[\s*(["'])Stryker was here\1\s*\]$/.test(x.replacement.trim())) {
      variants.push({ rule: 'filler-array', replacement: '[undefined]' })
    }
    if (x.mutator === 'UnaryOperator' && x.replacement.startsWith('+') && x.original.startsWith('-')) {
      variants.push({ rule: 'unary-plus', replacement: x.replacement.slice(1) })
    }
    if (x.mutator === 'ArrowFunction' || x.mutator === 'BlockStatement') {
      // () => undefined, or an emptied function body: the function returns
      // undefined. Mootant writes that as return-value `undefined` on the
      // expression body or on the single `return X` of the body.
      let chunk = originalHash(x.file, x.chunk)
      let found = null
      const visit = node => {
        if (!node || typeof node !== 'object' || found) return
        if (Array.isArray(node)) return node.forEach(visit)
        if (typeof node.type === 'string' && node.start + x.chunk.s === x.s && node.end + x.chunk.s === x.e) {
          if (x.mutator === 'ArrowFunction' && node.type === 'ArrowFunctionExpression') found = node
          if (x.mutator === 'BlockStatement' && node.type === 'BlockStatement') found = node
        }
        for (let k of Object.keys(node)) if (k !== 'type' && typeof node[k] === 'object') visit(node[k])
      }
      visit(chunk.program)
      if (found) {
        let block = found.type === 'ArrowFunctionExpression' ? found.body : found
        let target = null
        if (found.type === 'ArrowFunctionExpression' && found.expression) target = found.body
        else if (block.type === 'BlockStatement') {
          let statements = block.body.filter(st => st.type !== 'EmptyStatement')
          if (statements.length === 1 && statements[0].type === 'ReturnStatement' && statements[0].argument) target = statements[0].argument
        }
        if (target) {
          let s = target.start + x.chunk.s
          let e = target.end + x.chunk.s
          variants.push({ rule: x.mutator === 'ArrowFunction' ? 'arrow-undefined' : 'empty-body-undefined', start: s, end: e, replacement: 'undefined' })
        }
      }
    }
    return variants.map(v => {
      let start = v.start ?? x.s
      let end = v.end ?? x.e
      let edit = trimEdit(text, start, end, v.replacement)
      let chunk = chunkOf(x.file, edit)
      let { hash } = hashOf(x.file, chunk, edit)
      return { rule: v.rule, key: `${x.file}|${chunk.s}:${chunk.e}|${hash}` }
    })
  }

  for (let x of sEntries) {
    x.mMatch = mIndex.get(keyOf(x)) ?? []
    x.kMatch = kIndex.get(keyOf(x)) ?? []
    x.matchKind = x.mMatch.length > 0 || x.kMatch.length > 0 ? 'exact' : 'none'
    x.approxRule = null
    if (x.matchKind === 'none') {
      for (let v of approxVariants(x)) {
        let m = mIndex.get(v.key) ?? []
        let k = kIndex.get(v.key) ?? []
        if (m.length > 0 || k.length > 0) {
          x.mMatch = m
          x.kMatch = k
          x.matchKind = 'approx'
          x.approxRule = v.rule
          break
        }
      }
    }
    for (let m of x.mMatch) (m.sMatch ??= []).push({ x, kind: x.matchKind, rule: x.approxRule })
  }
  for (let m of mEntries) m.sMatch ??= []

  // Containment: Mootant mutants whose edit lies inside the Stryker range, and
  // Stryker mutants whose range holds a Mootant edit.
  const inside = (outer, inner) =>
    inner.file === outer.file && outer.s <= inner.edit.s && inner.edit.e <= outer.e
  for (let x of sEntries) {
    x.mInside = mEntries.filter(m => inside(x, m) && !x.mMatch.includes(m))
  }
  for (let m of mEntries) {
    m.sAround = sEntries.filter(x => inside(x, m) && !m.sMatch.some(p => p.x === x))
    // Stryker's useful mutants whose range overlaps this mutant's range either
    // way (a sub-expression of it or an enclosing expression)
    m.sOverlapUseful = sEntries.filter(
      x => x.file === m.file && isUseful(x.status) && x.s < m.e && m.s < x.e && !m.sMatch.some(p => p.x === x),
    )
  }
  let mById = new Map(mEntries.map(m => [m.id, m]))
  // The mutants a skipped candidate points at: the justifier's id when the list
  // gives one (solitary, duplicates), otherwise every emitted mutant of the
  // named mutator at the named node start (owned and subsumed rules record only
  // the mutator and the node).
  // When the named mutator made no mutant there because that candidate was
  // skipped too (O4 → O3 → logical-operator), the chain is followed.
  const ownersOf = (k, depth = 0) => {
    if (!k.by || depth > 4) return []
    if (k.by.id) return mById.has(k.by.id) ? [mById.get(k.by.id)] : []
    let at = e => e.file === k.file && e.mutator === k.by.mutator && e.line === k.by.line && e.column === k.by.column
    let direct = mEntries.filter(at)
    if (direct.length > 0) return direct
    return [...new Set(kEntries.filter(at).flatMap(o => ownersOf(o, depth + 1)))]
  }

  // ---- Classes of Stryker's useful mutants ----
  for (let x of sEntries) {
    if (x.mMatch.length > 0) x.cls = 'a'
    else if (x.kMatch.length > 0) x.cls = 'b'
    else x.cls = 'c'
    x.mUsefulInside = x.mInside.filter(m => isUseful(m.status))
    if (x.cls === 'b') {
      let k = x.kMatch[0]
      let owners = ownersOf(k)
      x.skip = {
        category: k.category, rule: k.rule, heuristic: k.heuristic, reason: k.reason, mutator: k.mutator,
        by: k.by ? { id: k.by.id, mutator: k.by.mutator, line: k.by.line, column: k.by.column } : null,
        owners: owners.map(m => ({ id: m.id, mutator: m.mutator, status: m.status, line: m.line, original: m.original, replacement: m.replacement, stryker: m.sMatch.map(p => p.x.status) })),
      }
      x.skip.ownerStatus = owners.length === 0 ? (k.by ? 'not-found' : 'none') : owners.some(m => isUseful(m.status)) ? 'useful' : 'killed'
    }
    x.gapVisible =
      x.cls === 'a' ? x.mMatch.some(m => isUseful(m.status)) || x.mUsefulInside.length > 0
      : x.mUsefulInside.length > 0 || (x.cls === 'b' && x.skip.ownerStatus === 'useful')
  }

  // ---- Summaries ----
  const tally = (entries, f) => entries.reduce((acc, x) => {
    let k = f(x)
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})
  let sUseful = sEntries.filter(x => isUseful(x.status))
  let mUseful = mEntries.filter(m => isUseful(m.status))
  let matchedPairs = sEntries.filter(x => x.mMatch.length > 0)
  let disagreements = []
  for (let x of matchedPairs) for (let m of x.mMatch) {
    if (isUseful(x.status) !== isUseful(m.status)) disagreements.push({ x, m })
  }
  let mOnlyUseful = mUseful.filter(m => m.sMatch.length === 0)

  // Unit trace of Mootant run 1 (analysis/bench/lib/trace-units.mjs, Vitest
  // only): slot time (start → done of every unit, process start included)
  // and units per mutant, by the mutant's final status.
  let unitCost = null
  let traceFile = path.join(mDir, 'run-1.units.json')
  if (existsSync(traceFile)) {
    let trace = readJson(traceFile)
    let statusById = new Map(mRuns[0].report.mutants.map(m => [m.id, m.status]))
    unitCost = { byStatus: {}, rounds: [] }
    for (let work of trace.works) for (let round of work.rounds) {
      if (round.kind === 'dry') continue
      let units = 0
      let busy = 0
      for (let unit of round.units) {
        if (unit.start === undefined || unit.done === undefined) continue
        let [hash, index] = unit.name.split('-')
        let mutant = round.files[hash]?.units?.[Number(index)]?.mutant
        let status = statusById.get(mutant) ?? 'unknown'
        let cost = (unitCost.byStatus[status] ??= { units: 0, busySeconds: 0, mutants: new Set() })
        cost.units++
        cost.busySeconds += (unit.done - unit.start) / 1000
        cost.mutants.add(mutant)
        units++
        busy += (unit.done - unit.start) / 1000
      }
      unitCost.rounds.push({ units, busySeconds: Math.round(busy * 10) / 10 })
    }
    for (let cost of Object.values(unitCost.byStatus)) {
      cost.mutants = cost.mutants.size
      cost.busySeconds = Math.round(cost.busySeconds * 10) / 10
    }
  }
  let mTime = hyperfine(mDir)
  let sTime = hyperfine(sDir)
  let withVerdict = (counts, ignored) => Object.entries(counts).filter(([s]) => !ignored.includes(s) && s !== 'run').reduce((a, [, n]) => a + n, 0)
  let mTotal = withVerdict(mCounts[0], ['Ignored'])
  let sTotal = withVerdict(sCounts[0], ['Ignored'])
  let mUsefulN = (mCounts[0].Survived ?? 0) + (mCounts[0].NoCoverage ?? 0)
  let sUsefulN = (sCounts[0].Survived ?? 0) + (sCounts[0].NoCoverage ?? 0)
  let timing = {
    mootant: mTime && {
      ...mTime,
      perMutant: mTime.mean / mTotal,
      perUseful: mTime.mean / mUsefulN,
      phases: mRuns.map(({ report }) => report.summary.duration),
      unitCost,
      runs: mRuns.map(({ report }) => report.summary.runs),
      stderr: mRuns.map(({ k }) => {
        let file = path.join(mDir, `run-${k}.err`)
        // only Mootant's round summaries ('+ dry run …', '+ testing …'): the
        // rest of stderr is the test output of node:test
        return existsSync(file) ? stripAnsi(readFileSync(file, 'utf8')).split('\n').filter(l => l.startsWith('+ ')) : null
      }),
    },
    stryker: sTime && {
      ...sTime,
      perMutant: sTime.mean / sTotal,
      perUseful: sTime.mean / sUsefulN,
      phases: sRuns.map(({ k }) => strykerLog(sDir, k)),
    },
  }

  let summary = {
    project,
    runs: { mootant: mRuns.length, stryker: sRuns.length },
    offsetMismatch,
    listVsRun,
    notes: [...new Set(notes)],
    counts: {
      mootant: { total: moo.length, statuses: mCounts, byMutator: tally(mEntries, m => m.mutator), usefulByMutator: tally(mUseful, m => m.mutator) },
      stryker: {
        total: sEntries.length,
        statuses: sCounts,
        byMutator: tally(sEntries, x => x.mutator),
        usefulByMutator: tally(sUseful, x => x.mutator),
        static: sEntries.filter(x => x.static).length,
      },
      skipped: {
        total: kEntries.length,
        byCategory: tally(kEntries, k => k.category),
        byRule: tally(kEntries, k => `${k.rule}${k.heuristic ? '*' : ''}`),
      },
    },
    determinism: {
      mootantDiffering: mDiff.map(d => ({ id: d.key, statuses: d.statuses, mutator: mById.get(d.key)?.mutator, line: mById.get(d.key)?.line })),
      strykerDiffering: sDiff.map(d => ({ key: d.key, statuses: d.statuses })),
    },
    parse: {
      errors: [...mEntries, ...kEntries, ...sEntries].filter(x => x.parseError).length,
      strykerIdentity: sEntries.filter(x => x.identity).map(x => `${x.id} ${x.mutator} ${x.line}`),
      mootantIdentity: mEntries.filter(x => x.identity).map(x => `${x.id} ${x.mutator} ${x.line}`),
    },
    matching: {
      strykerMatchedToMootant: { exact: sEntries.filter(x => x.mMatch.length > 0 && x.matchKind === 'exact').length, approx: sEntries.filter(x => x.mMatch.length > 0 && x.matchKind === 'approx').length },
      strykerMatchedToSkippedOnly: { exact: sEntries.filter(x => x.cls === 'b' && x.matchKind === 'exact').length, approx: sEntries.filter(x => x.cls === 'b' && x.matchKind === 'approx').length },
      strykerUnmatched: sEntries.filter(x => x.cls === 'c').length,
      approxRules: tally(sEntries.filter(x => x.matchKind === 'approx'), x => x.approxRule),
      mootantMatched: mEntries.filter(m => m.sMatch.length > 0).length,
      mootantMatchedApproxOnly: mEntries.filter(m => m.sMatch.length > 0 && m.sMatch.every(p => p.kind === 'approx')).length,
      pairsByMutators: tally(matchedPairs.flatMap(x => x.mMatch.map(m => ({ x, m }))), ({ x, m }) => `${x.mutator} -> ${m.mutator}`),
      strykerUnmatchedByMutator: tally(sEntries.filter(x => x.cls === 'c'), x => x.mutator),
      strykerSkippedByRule: tally(sEntries.filter(x => x.cls === 'b'), x => `${x.skip.category}/${x.skip.rule}`),
      strykerMultiMatch: sEntries.filter(x => x.mMatch.length > 1).length,
    },
    strykerUseful: {
      total: sUseful.length,
      byClass: tally(sUseful, x => x.cls),
      a: {
        mootantUseful: sUseful.filter(x => x.cls === 'a' && x.mMatch.some(m => isUseful(m.status))).length,
        mootantKilled: sUseful.filter(x => x.cls === 'a' && !x.mMatch.some(m => isUseful(m.status))).length,
        approx: sUseful.filter(x => x.cls === 'a' && x.matchKind === 'approx').length,
        mootantStatuses: tally(sUseful.filter(x => x.cls === 'a'), x => x.mMatch.map(m => m.status).join('+')),
      },
      b: {
        byCategory: tally(sUseful.filter(x => x.cls === 'b'), x => x.skip.category),
        byRule: tally(sUseful.filter(x => x.cls === 'b'), x => `${x.skip.rule}${x.skip.heuristic ? '*' : ''}`),
        ownerStatus: tally(sUseful.filter(x => x.cls === 'b'), x => x.skip.ownerStatus),
        gapVisible: sUseful.filter(x => x.cls === 'b' && x.gapVisible).length,
        approx: sUseful.filter(x => x.cls === 'b' && x.matchKind === 'approx').length,
      },
      c: {
        byMutator: tally(sUseful.filter(x => x.cls === 'c'), x => x.mutator),
        gapVisible: sUseful.filter(x => x.cls === 'c' && x.gapVisible).length,
        gapVisibleByMutator: tally(sUseful.filter(x => x.cls === 'c' && x.gapVisible), x => x.mutator),
      },
    },
    mootantUseful: {
      total: mUseful.length,
      matched: mUseful.length - mOnlyUseful.length,
      only: mOnlyUseful.length,
      onlyByMutator: tally(mOnlyUseful, m => m.mutator),
      onlyStrykerSeesRegion: mOnlyUseful.filter(m => m.sAround.some(x => isUseful(x.status))).length,
      onlyStrykerUsefulOverlap: mOnlyUseful.filter(m => m.sOverlapUseful.length > 0).length,
      matchedStrykerStatuses: tally(mUseful.filter(m => m.sMatch.length > 0), m => m.sMatch.map(p => p.x.status).join('+')),
    },
    // Mootant's skipped candidates that Stryker made too: Stryker's verdict for
    // them is an outside check of the skip rule (a survivor whose owner was
    // killed would be a false skip; see the manual review for those).
    skipAudit: (() => {
      let audit = {}
      for (let x of sEntries) for (let k of x.kMatch) {
        let key = `${k.category}/${k.rule}${k.heuristic ? '*' : ''}`
        let a = (audit[key] ??= { twins: 0, alsoEmitted: 0, strykerStatuses: {}, ids: new Set() })
        if (a.ids.has(k.id)) continue
        a.ids.add(k.id)
        a.twins++
        // the same mutant was emitted by another Mootant mutator: a pure duplicate
        if (x.mMatch.length > 0) a.alsoEmitted++
        else a.strykerStatuses[x.status] = (a.strykerStatuses[x.status] ?? 0) + 1
      }
      for (let a of Object.values(audit)) delete a.ids
      return audit
    })(),
    disagreements: {
      total: disagreements.length,
      strykerUsefulMootantNot: disagreements.filter(d => isUseful(d.x.status)).length,
      mootantUsefulStrykerNot: disagreements.filter(d => isUseful(d.m.status)).length,
    },
    timing,
  }
  return { summary, sEntries, mEntries, kEntries, disagreements, mOnlyUseful }
}

// ---- Output -------------------------------------------------------------------

// Cells keep spaces as they are (a test with 'a  b' must survive), lose line
// breaks, and are cut at `max` characters (code fragments; prose is not cut).
const csvCell = (value, max) => {
  if (value === null || value === undefined) return ''
  let text = typeof value === 'string' ? value : JSON.stringify(value)
  text = text.replace(/[\r\n\t]+\s*/g, ' ')
  if (max && text.length > max) text = `${text.slice(0, max - 1)}…`
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
const writeCsv = (file, rows, max = 300) => {
  if (rows.length === 0) return writeFileSync(file, '')
  let columns = Object.keys(rows[0])
  writeFileSync(file, [columns.join(','), ...rows.map(r => columns.map(c => csvCell(r[c], max)).join(','))].join('\n') + '\n')
}
const short = (m) => (m ? `${m.mutator}:${m.status}` : '')

function strykerRow(project, x) {
  return {
    project,
    id: x.id,
    file: x.file,
    line: x.line,
    column: x.column,
    mutator: x.mutator,
    original: x.original,
    replacement: x.replacement,
    status: x.status,
    statuses: (x.statuses ?? []).join('/'),
    static: x.static,
    match: x.matchKind,
    approxRule: x.approxRule,
    class: x.cls,
    mootant: x.mMatch.map(m => `${m.id} ${short(m)}`).join('; '),
    skipped: x.kMatch.map(k => `${k.category}/${k.rule}${k.heuristic ? '*' : ''}`).join('; '),
    skipBy: x.skip?.by ? `${x.skip.by.mutator} L${x.skip.by.line}:${x.skip.by.column}` : '',
    owners: (x.skip?.owners ?? []).map(m => `${m.id} ${m.mutator}:${m.status} ${JSON.stringify(m.replacement).slice(0, 40)}${m.stryker.length ? ` [S:${m.stryker.join('+')}]` : ''}`).join('; '),
    ownerStatus: x.skip?.ownerStatus ?? '',
    mootantInside: x.mInside.length,
    mootantUsefulInside: x.mUsefulInside.map(m => `${m.id} ${m.mutator}:${m.status} L${m.line}`).join('; '),
    gapVisible: x.gapVisible,
  }
}
function mootantRow(project, m) {
  return {
    project,
    id: m.id,
    file: m.file,
    line: m.line,
    column: m.column,
    mutator: m.mutator,
    original: m.original,
    replacement: m.replacement,
    status: m.status,
    statuses: (m.statuses ?? []).join('/'),
    match: m.sMatch.map(p => p.kind).join('; '),
    stryker: m.sMatch.map(p => `${p.x.id} ${short(p.x)}${p.rule ? ` (${p.rule})` : ''}`).join('; '),
    strykerAround: m.sAround.map(x => `${x.id} ${short(x)}`).join('; '),
    strykerUsefulAround: m.sAround.filter(x => isUseful(x.status)).length,
    strykerUsefulOverlap: m.sOverlapUseful.map(x => `${x.id} ${x.mutator}:${x.status} L${x.line}`).join('; '),
    killedBy: m.killedBy,
    cause: m.cause,
    message: m.message,
  }
}

// Deterministic stratified sample. The quota is split evenly between the
// projects (a project with fewer items gives the rest to the others); inside a
// project the strata (class and rule or mutator) are visited round-robin in a
// seeded order, and so are the items of each stratum.
function seededOrder(items, seed) {
  let state = seed >>> 0
  const next = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32)
  return items.map(item => ({ item, r: next() })).sort((a, b) => a.r - b.r).map(({ item }) => item)
}
function roundRobin(items, stratum, limit, seed) {
  let groups = new Map()
  for (let item of seededOrder(items, seed)) {
    let key = stratum(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  let keys = seededOrder([...groups.keys()].sort(), seed + 7)
  let picked = []
  for (let round = 0; picked.length < limit; round++) {
    let added = false
    for (let key of keys) {
      let group = groups.get(key)
      if (round < group.length && picked.length < limit) {
        picked.push(group[round])
        added = true
      }
    }
    if (!added) break
  }
  return picked
}
function stratified(items, stratum, limit, seed) {
  let byProject = new Map()
  for (let item of items) {
    if (!byProject.has(item.project)) byProject.set(item.project, [])
    byProject.get(item.project).push(item)
  }
  let quota = new Map([...byProject.keys()].map(p => [p, 0]))
  let left = Math.min(limit, items.length)
  while (left > 0) {
    let open = [...byProject.keys()].filter(p => quota.get(p) < byProject.get(p).length)
    let share = Math.max(1, Math.floor(left / open.length))
    for (let p of open.sort()) {
      if (left === 0) break
      let add = Math.min(share, byProject.get(p).length - quota.get(p), left)
      quota.set(p, quota.get(p) + add)
      left -= add
    }
  }
  return [...byProject.keys()].sort().flatMap(p => roundRobin(byProject.get(p), stratum, quota.get(p), seed))
}

let requested = process.argv.slice(2)
let projects = requested.length > 0 ? requested : PROJECTS
let all = []
for (let project of projects) {
  let started = performance.now()
  let result = analyse(project)
  if (!result) {
    console.log(`${project}: no complete data (m-cold, s-cold run-1.json and the list), skipped`)
    continue
  }
  all.push(result)
  writeCsv(path.join(OUT, `${project}-stryker.csv`), result.sEntries.map(x => strykerRow(project, x)))
  writeCsv(path.join(OUT, `${project}-mootant.csv`), result.mEntries.map(m => mootantRow(project, m)))
  let s = result.summary
  console.log(
    `${project}: mootant ${s.counts.mootant.total} (${s.mootantUseful.total} useful), stryker ${s.counts.stryker.total} (${s.strykerUseful.total} useful), ` +
      `matched exact ${s.matching.strykerMatchedToMootant.exact} approx ${s.matching.strykerMatchedToMootant.approx}, ` +
      `skipped-only ${s.matching.strykerMatchedToSkippedOnly.exact}+${s.matching.strykerMatchedToSkippedOnly.approx}, unmatched ${s.matching.strykerUnmatched}; ` +
      `${Math.round(performance.now() - started)} ms`,
  )
}

let review = existsSync(path.join(OUT, 'review.json')) ? readJson(path.join(OUT, 'review.json')) : null
writeFileSync(
  path.join(OUT, 'summary.json'),
  `${JSON.stringify({ generated: new Date().toISOString(), oxcParser: { version: OXC_VERSION, from: OXC_FROM }, seed: SEED, projects: all.map(r => r.summary) }, null, 1)}\n`,
)
writeCsv(
  path.join(OUT, 'stryker-useful.csv'),
  all.flatMap(r => r.sEntries.filter(x => isUseful(x.status)).map(x => strykerRow(r.summary.project, x))),
)
writeCsv(
  path.join(OUT, 'mootant-only-useful.csv'),
  all.flatMap(r => r.mOnlyUseful.map(m => mootantRow(r.summary.project, m))),
)
writeCsv(
  path.join(OUT, 'verdict-disagreements.csv'),
  all.flatMap(r =>
    r.disagreements.map(({ x, m }) => ({
      project: r.summary.project,
      file: x.file,
      line: x.line,
      stryker: `${x.id} ${x.mutator}`,
      strykerStatus: x.status,
      strykerStatuses: (x.statuses ?? []).join('/'),
      static: x.static,
      mootant: `${m.id} ${m.mutator}`,
      mootantStatus: m.status,
      mootantStatuses: (m.statuses ?? []).join('/'),
      match: x.matchKind,
      original: x.original,
      replacement: m.replacement,
      killedBy: m.killedBy,
      message: m.message,
    })),
  ),
)

// Sample for the manual review: Stryker's useful mutants of classes (b) and (c)
// (stratum: project, class, rule or mutator), and Mootant-only useful mutants
// (stratum: project, mutator).
let bc = all.flatMap(r => r.sEntries.filter(x => isUseful(x.status) && x.cls !== 'a').map(x => ({ project: r.summary.project, x })))
let sampleBC = stratified(bc, ({ project, x }) => `${project}|${x.cls}|${x.cls === 'b' ? x.skip.rule : x.mutator}`, 30, SEED)
let onlyM = all.flatMap(r => r.mOnlyUseful.map(m => ({ project: r.summary.project, m })))
let sampleM = stratified(onlyM, ({ project, m }) => `${project}|${m.mutator}`, 15, SEED + 1)
writeCsv(path.join(OUT, 'sample.csv'), [
  ...sampleBC.map(({ project, x }) => ({ set: `stryker-${x.cls}`, key: `${project}:stryker:${x.id}`, ...strykerRow(project, x), mootantStatus: '' })),
  ...sampleM.map(({ project, m }) => ({
    set: 'mootant-only', key: `${project}:mootant:${m.id}`, project, id: m.id, file: m.file, line: m.line, column: m.column, mutator: m.mutator,
    original: m.original, replacement: m.replacement, status: '', statuses: '', static: '', match: '', approxRule: '', class: '',
    mootant: '', skipped: '', skipBy: '', owners: '', ownerStatus: '', mootantInside: '', mootantUsefulInside: '', gapVisible: '',
    mootantStatus: m.status,
  })),
])
// Manual review (review.json, written by hand): verdicts of the sampled items
// and of every other item that was reviewed. Joined with the data here so the
// tables in the report come from one place.
if (review) {
  let rows = []
  let lookup = new Map()
  for (let r of all) {
    for (let x of r.sEntries) lookup.set(`${r.summary.project}:stryker:${x.id}`, { project: r.summary.project, x })
    for (let m of r.mEntries) lookup.set(`${r.summary.project}:mootant:${m.id}`, { project: r.summary.project, m })
  }
  let sampled = new Set([...sampleBC.map(({ project, x }) => `${project}:stryker:${x.id}`), ...sampleM.map(({ project, m }) => `${project}:mootant:${m.id}`)])
  let missing = []
  for (let key of sampled) if (!review.items[key]) missing.push(key)
  for (let [key, item] of Object.entries(review.items)) {
    let found = lookup.get(key)
    if (!found) {
      missing.push(`${key} (not in the data)`)
      continue
    }
    let { project, x, m } = found
    let e = x ?? m
    rows.push({
      key,
      sampled: sampled.has(key),
      project,
      set: x ? `stryker-${x.cls}` : 'mootant-only',
      place: `${e.file}:${e.line}`,
      mutator: e.mutator,
      status: e.status,
      original: e.original,
      replacement: e.replacement,
      mootant: x ? (x.cls === 'b' ? `skipped ${x.skip.category}/${x.skip.rule}${x.skip.heuristic ? '*' : ''}` : 'not generated') : '',
      ownerStatus: x?.skip?.ownerStatus ?? '',
      mootantUsefulInside: x ? x.mUsefulInside.map(i => `${i.mutator}:${i.status} L${i.line}`).join('; ') : '',
      strykerUsefulAround: m ? m.sOverlapUseful.map(a => `#${a.id} ${a.mutator}:${a.status} L${a.line}`).join('; ') : '',
      verdict: item.verdict,
      why: item.why,
      test: item.test ?? '',
      bug: item.bug ?? '',
    })
  }
  writeCsv(path.join(OUT, 'review.csv'), rows, 0)
  let count = (list, f) => list.reduce((acc, row) => ((acc[f(row)] = (acc[f(row)] ?? 0) + 1), acc), {})
  let reviewSummary = {
    reviewed: rows.length,
    sampled: rows.filter(r => r.sampled).length,
    missingFromReview: missing,
    stryker: {
      all: count(rows.filter(r => r.set !== 'mootant-only'), r => r.verdict),
      sampled: count(rows.filter(r => r.set !== 'mootant-only' && r.sampled), r => r.verdict),
      byProject: count(rows.filter(r => r.set !== 'mootant-only'), r => `${r.project}|${r.verdict}`),
      bySet: count(rows.filter(r => r.set !== 'mootant-only'), r => `${r.set}|${r.verdict}`),
    },
    mootantOnly: {
      all: count(rows.filter(r => r.set === 'mootant-only'), r => r.verdict),
      sampled: count(rows.filter(r => r.set === 'mootant-only' && r.sampled), r => r.verdict),
      byProject: count(rows.filter(r => r.set === 'mootant-only'), r => `${r.project}|${r.verdict}`),
      byMutator: count(rows.filter(r => r.set === 'mootant-only'), r => `${r.mutator}|${r.verdict}`),
    },
  }
  let summaryFile = path.join(OUT, 'summary.json')
  let summary = readJson(summaryFile)
  summary.review = reviewSummary
  writeFileSync(summaryFile, `${JSON.stringify(summary, null, 1)}\n`)
  console.log(`review.json: ${rows.length} reviewed items, ${reviewSummary.sampled} of ${sampled.size} sampled; missing ${missing.length}`)
}
console.log(`written to ${OUT}`)
