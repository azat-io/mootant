// Converters from Mootant JSON reports to alternative encodings for agents.
// toon(): @toon-format/toon encode of the same object (lossless).
// compactList() / compactRun(): proposed line-oriented "agent" format
// (one header line per mutant + unified-diff lines), see 06-ux-and-agents.md.
import { encode } from '@toon-format/toon'

export function toon(value, options = {}) {
  return encode(value, options)
}

function groupByFile(mutants) {
  let files = new Map()
  for (let m of mutants) {
    if (!files.has(m.file)) files.set(m.file, [])
    files.get(m.file).push(m)
  }
  return files
}

function diffLines(m) {
  let lines = []
  for (let line of m.before ?? []) lines.push(`  - ${line}`)
  for (let line of m.after ?? []) lines.push(`  + ${line}`)
  return lines
}

const STATUS = { Survived: 'survived', NoCoverage: 'nocov', Error: 'error', Killed: 'killed', Timeout: 'timeout', Ignored: 'ignored', Pending: '' }

// List report: "<id> <line>:<col> <mutator>[ scope]" + diff.
export function compactList(report, { skipped = false } = {}) {
  let out = [`mootant list · ${report.preset} · ${report.summary.totalMutants} mutants in ${report.summary.totalFiles} files`]
  for (let [file, mutants] of groupByFile(report.mutants)) {
    out.push('', file)
    for (let m of mutants) {
      let status = STATUS[m.status] ?? m.status
      out.push(`${m.id} ${m.line}:${m.column} ${m.mutator}${status ? ' ' + status : ''}${m.scope ? ' @' + m.scope : ''}`)
      out.push(...diffLines(m))
    }
  }
  if (skipped && report.skipped) {
    out.push('', 'skipped (category rule heuristic? line:col mutator: original -> replacement — reason)')
    for (let [file, items] of groupByFile(report.skipped)) {
      out.push('', file)
      for (let s of items) {
        out.push(`${s.line}:${s.column} ${s.category}/${s.rule}${s.heuristic ? '?' : ''} ${s.mutator}: ${JSON.stringify(s.original)} -> ${JSON.stringify(s.replacement)} — ${s.reason}`)
      }
    }
  }
  return out.join('\n') + '\n'
}

// Run report (slim or verbose): only fields an agent acts on.
export function compactRun(report, { recheck } = {}) {
  let s = report.summary
  let head = [`mootant run · ${report.runner}${report.runnerVersion ? ' ' + report.runnerVersion : ''} · ${report.preset} · mode ${report.mode}`,
    `score ${s.score ?? '-'}% covered ${s.coveredScore ?? '-'}% · killed ${s.totalKilled} timeout ${s.totalTimeout} survived ${s.totalSurvived} nocov ${s.totalNoCoverage} errors ${s.totalErrorMutants} ignored ${s.totalIgnored} · passed ${s.passed}`]
  let template = recheck ?? (report.mutants.find(m => m.recheck)?.recheck ?? '').replace(/--mutant \S+/, '--mutant <id>')
  if (template) head.push(`recheck: ${template}`)
  let out = [...head]
  for (let d of report.diagnostics ?? []) out.push(`${d.severity}: ${d.file ? d.file + (d.line ? ':' + d.line : '') + ' ' : ''}${d.message}`)
  for (let [file, mutants] of groupByFile(report.mutants)) {
    out.push('', file)
    for (let m of mutants) {
      let status = STATUS[m.status] ?? m.status
      if (m.status === 'Killed' || m.status === 'Timeout') {
        out.push(`${m.id} ${m.line}:${m.column} ${m.mutator} ${status}${m.killedIn ? ' by ' + m.killedIn : ''}${m.path === 'batch' ? ' batch' : ''}`)
        continue
      }
      let parts = [`${m.id} ${m.line}:${m.column} ${m.mutator} ${status}`]
      if (m.tests !== undefined && m.tests !== null) parts.push(`tests=${m.tests}`)
      if (m.scope) parts.push(`@${m.scope}`)
      out.push(parts.join(' '))
      if (m.message) out.push(`  ! ${m.message}`)
      out.push(...diffLines(m))
      let files = m.testFiles ? Object.keys(m.testFiles) : []
      if (files.length) out.push(`  extend: ${files.join(', ')}`)
      if (m.test) out.push(`  near: ${m.test.file}${m.test.line ? ':' + m.test.line : ''} ${JSON.stringify(m.test.name)}`)
    }
  }
  return out.join('\n') + '\n'
}

// Emulates cli/report/slim-run-report.ts:27-106 and slim-list-mutant on a
// verbose (--json --verbose) run report, so the slim forms can be measured
// on the same run without re-running Mootant.
export function slimRun(report, { all = true } = {}) {
  let s = report.summary
  let summary = {
    ...(s.coveredScore !== null && { coveredScore: s.coveredScore }),
    ...(s.totalBatch !== null && { totalBatch: s.totalBatch }),
    ...(s.threshold !== null && { threshold: s.threshold }),
    ...(s.score !== null && { score: s.score }),
    totalErrorMutants: s.totalErrorMutants, duration: { total: s.duration.total },
    totalNoCoverage: s.totalNoCoverage, totalSurvived: s.totalSurvived, totalWarnings: s.totalWarnings,
    totalIgnored: s.totalIgnored, totalTimeout: s.totalTimeout, totalMutants: s.totalMutants,
    totalKilled: s.totalKilled, totalErrors: s.totalErrors, totalTests: s.totalTests, totalFiles: s.totalFiles, passed: s.passed,
  }
  let actionable = new Set(['Survived', 'NoCoverage', 'Error'])
  let mutants = report.mutants
    .filter(m => all || actionable.has(m.status))
    .map(m => {
      let batch = m.path === 'batch' && { path: 'batch' }
      if (m.status === 'Killed' || m.status === 'Timeout') {
        return { ...(m.killedIn !== null && { killedIn: m.killedIn }), mutator: m.mutator, column: m.column, file: m.file, line: m.line, id: m.id, ...batch, status: m.status }
      }
      return {
        ...slimListMutant(m),
        ...(m.testFiles && Object.keys(m.testFiles).length > 0 && { testFiles: m.testFiles }),
        ...(m.test && { test: { ...(m.test.line !== null && { line: m.test.line }), file: m.test.file, name: m.test.name } }),
        ...(m.status !== 'Ignored' && { tests: m.tests }),
        ...(m.message !== null && { message: m.message }),
        ...(m.recheck !== null && { recheck: m.recheck }),
        ...(m.cause !== null && { cause: m.cause }),
        ...batch,
      }
    })
  return { summary, schemaVersion: report.schemaVersion, diagnostics: report.diagnostics, command: report.command,
    listed: all ? 'all' : 'actionable', runner: report.runner, preset: report.preset, mode: report.mode,
    ...(report.since !== null && report.since !== undefined && { since: report.since }), mutants }
}

// Approximates cli/report/slim-list-mutant.ts (cut markers are already in
// before/after of the verbose report as cutStart/cutEnd; we keep texts as is).
function slimListMutant(m) {
  let before = [...m.before], after = [...m.after]
  for (let lines of [before, after]) {
    if (m.cutStart > 0) lines[0] = '\u2026' + lines[0]
    if (m.cutEnd > 0) lines[lines.length - 1] = lines.at(-1) + '\u2026'
  }
  return {
    ...(m.scope !== null && m.scope !== undefined && { scope: m.scope }),
    ...(m.focus && { focus: { replacement: m.focus.replacement, original: m.focus.original, column: m.focus.column, line: m.focus.line } }),
    ...(m.ignoredBy !== null && m.ignoredBy !== undefined && { ignoredBy: m.ignoredBy }),
    ...(m.reason !== null && m.reason !== undefined && { reason: m.reason }),
    mutator: m.mutator, column: m.column, status: m.status, before, after, file: m.file, line: m.line, id: m.id,
  }
}

// Splits before/after into the changed middle: [prefix, original, replacement].
export function changeOf(before, after) {
  let a = before.join('\n'), b = after.join('\n')
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let s = 0
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
  return { original: a.slice(p, a.length - s), replacement: b.slice(p, b.length - s) }
}

// v2: source line once per group, then one line per mutant with the change.
function fmtChange(m) {
  let { original, replacement } = m.original !== undefined && m.replacement !== undefined && !m.original.includes('\n') && m.original.length < 160
    ? { original: m.original, replacement: m.replacement }
    : changeOf(m.before ?? [], m.after ?? [])
  let o = original.replace(/\n\s*/g, '⏎'), r = replacement.replace(/\n\s*/g, '⏎')
  if (o.length > 120) o = o.slice(0, 57) + '…' + o.slice(-57)
  if (r.length > 120) r = r.slice(0, 57) + '…' + r.slice(-57)
  return `${o || '∅'} → ${r || '∅'}`
}

export function compactList2(report) {
  let out = [`mootant list · ${report.preset} · ${report.summary.totalMutants} mutants in ${report.summary.totalFiles} files · id :col mutator  original → replacement`]
  for (let [file, mutants] of groupByFile(report.mutants)) {
    out.push('', file)
    let lastLine = null
    for (let m of mutants) {
      let firstBefore = (m.before ?? [''])[0]
      if (m.line !== lastLine) { out.push(`${m.line}|${firstBefore}`); lastLine = m.line }
      out.push(`  ${m.id} :${m.column} ${m.mutator}  ${fmtChange(m)}`)
    }
  }
  return out.join('\n') + '\n'
}

export function compactRun2(report, { recheck } = {}) {
  let s = report.summary
  let out = [`mootant run · ${report.runner}${report.runnerVersion ? ' ' + report.runnerVersion : ''} · ${report.preset} · mode ${report.mode} · score ${s.score ?? '-'}% (covered ${s.coveredScore ?? '-'}%) · killed ${s.totalKilled} timeout ${s.totalTimeout} survived ${s.totalSurvived} nocov ${s.totalNoCoverage} errors ${s.totalErrorMutants} · passed ${s.passed}`]
  let template = recheck ?? (report.mutants.find(m => m.recheck)?.recheck ?? '').replace(/--mutant \S+/, '--mutant <id>')
  if (template) out.push(`recheck: ${template}`)
  out.push('legend: id :col mutator status [tests=N]  original → replacement; extend = test files to add a test to; near = covering test to start from')
  for (let d of report.diagnostics ?? []) out.push(`${d.severity}: ${d.file ? d.file + (d.line ? ':' + d.line : '') + ' ' : ''}${d.message}`)
  for (let [file, mutants] of groupByFile(report.mutants)) {
    out.push('', file)
    let lastLine = null
    let lastExtend = null
    for (let m of mutants) {
      let status = STATUS[m.status] ?? m.status
      if (m.status === 'Killed' || m.status === 'Timeout') {
        out.push(`  ${m.id} ${m.line}:${m.column} ${m.mutator} ${status}${m.killedIn ? ' by ' + m.killedIn : ''}`)
        continue
      }
      let firstBefore = (m.before ?? [''])[0]
      if (m.line !== lastLine) { out.push(`${m.line}|${firstBefore}`); lastLine = m.line }
      out.push(`  ${m.id} :${m.column} ${m.mutator} ${status}${m.tests !== undefined && m.tests !== null ? ' tests=' + m.tests : ''}  ${fmtChange(m)}`)
      if (m.message) out.push(`    ! ${m.message}`)
      let extend = m.testFiles ? Object.keys(m.testFiles).join(', ') : ''
      if (extend && extend !== lastExtend) { out.push(`    extend: ${extend}`); lastExtend = extend }
      if (m.test) out.push(`    near: ${m.test.file}${m.test.line ? ':' + m.test.line : ''} ${JSON.stringify(m.test.name)}`)
    }
  }
  return out.join('\n') + '\n'
}
