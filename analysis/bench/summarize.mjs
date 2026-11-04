#!/usr/bin/env node
// Builds the Markdown tables of the benchmark from what run.sh saved:
//   node analysis/bench/summarize.mjs [results-dir] > summary.md
// Results dir: $BENCH_RESULTS or /home/user/projects/bench/results. For every
// <project>/<point>/ it reads hyperfine.json (wall time of every run) and per
// run run-k.json (report), run-k.time (GNU time), run-k.mem.json (process
// tree) and run-k.units.json (Vitest units). Definitions: README, "Metrics".
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'

import { analyzeTrace } from './lib/units-report.mjs'

let root =
  process.argv[2] ?? process.env.BENCH_RESULTS ?? '/home/user/projects/bench/results'
let workers = Number(process.env.BENCH_CONCURRENCY ?? 3)

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function readTime(file) {
  if (!existsSync(file)) return null
  let values = {}
  for (let line of readFileSync(file, 'utf8').split('\n')) {
    let match = /^(\w+)=(.*)$/u.exec(line)
    if (match) values[match[1]] = Number(match[2])
  }
  return Object.keys(values).length > 0 ? values : null
}

function median(values) {
  let list = values.filter(value => typeof value === 'number' && !Number.isNaN(value))
  if (list.length === 0) return null
  list.sort((left, right) => left - right)
  let middle = Math.floor(list.length / 2)
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2
}

function seconds(ms, digits = 1) {
  return ms === null || ms === undefined ? '–' : (ms / 1000).toFixed(digits)
}

function fixed(value, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value) ? '–' : value.toFixed(digits)
}

function percent(value) {
  return value === null || value === undefined || !Number.isFinite(value) ? '–' : `${(value * 100).toFixed(0)}%`
}

const STATUSES = ['Killed', 'Survived', 'NoCoverage', 'Timeout', 'Error', 'Ignored']

// Counts of a Mootant report (`mootant run --json --all --verbose`).
function countMootant(report) {
  let s = report.summary
  let counts = {
    Killed: s.totalKilled,
    Survived: s.totalSurvived,
    NoCoverage: s.totalNoCoverage,
    Timeout: s.totalTimeout,
    Error: s.totalErrorMutants,
    Ignored: s.totalIgnored,
  }
  let cached = s.totalCached ?? 0
  return {
    all: s.totalMutants,
    counts,
    cached,
    tests: s.totalTests,
    score: s.score,
    phases: s.duration,
    runs: s.runs,
    units: (s.staticCost ?? []).reduce((total, cost) => total + cost.units, 0),
    unitMs: (s.staticCost ?? []).reduce((total, cost) => total + cost.duration, 0),
    mutantMs: (report.mutants ?? []).reduce((total, mutant) => total + (mutant.duration ?? 0), 0),
    diagnostics: (report.diagnostics ?? []).filter(d => d.severity === 'error').length,
    listed: report.listed,
  }
}

// Counts of a Stryker JSON report (mutation-testing-report-schema).
function countStryker(report) {
  let counts = Object.fromEntries(STATUSES.map(status => [status, 0]))
  let all = 0
  let statics = 0
  for (let file of Object.values(report.files ?? {})) {
    for (let mutant of file.mutants ?? []) {
      all++
      if (mutant.static) statics++
      let status = mutant.status
      if (status === 'RuntimeError' || status === 'CompileError') status = 'Error'
      if (status === 'Pending') status = 'Error'
      counts[status] = (counts[status] ?? 0) + 1
    }
  }
  let compileErrors = 0
  for (let file of Object.values(report.files ?? {})) {
    for (let mutant of file.mutants ?? []) {
      if (mutant.status === 'CompileError') compileErrors++
    }
  }
  let testCount = Object.values(report.testFiles ?? {}).reduce(
    (total, file) => total + (file.tests?.length ?? 0),
    0,
  )
  return {
    all,
    counts,
    cached: 0,
    compileErrors,
    statics,
    tests: testCount,
    score: null,
    phases: report.performance ?? null,
    framework: report.framework?.version ?? null,
  }
}

function describeRun(dir, k, kind) {
  let report = readJson(path.join(dir, `run-${k}.json`))
  let time = readTime(path.join(dir, `run-${k}.time`))
  let mem = readJson(path.join(dir, `run-${k}.mem.json`))
  let meta = readJson(path.join(dir, `run-${k}.meta.json`))
  let tracePath = path.join(dir, `run-${k}.units.json`)
  let units = existsSync(tracePath) ? analyzeTrace(readJson(tracePath), workers) : null
  let counted = null
  if (report !== null) {
    if (kind === 'mootant' && report.summary) counted = countMootant(report)
    else if (kind === 'stryker' && report.files) counted = countStryker(report)
  }
  return { k, report: counted, time, mem, meta, units }
}

function describePoint(project, point) {
  let dir = path.join(root, project, point)
  let hyperfine = readJson(path.join(dir, 'hyperfine.json'))
  let metas = readdirSync(dir).filter(name => /^run-\d+\.meta\.json$/u.test(name))
  let kind = point.startsWith('s-') ? 'stryker' : point === 'test' || point.startsWith('m-list') ? 'plain' : 'mootant'
  let runs = metas
    .map(name => Number(/\d+/u.exec(name)[0]))
    .sort((left, right) => left - right)
    .map(k => describeRun(dir, k, kind))
  let times = hyperfine?.results?.[0]?.times?.map(value => value * 1000) ?? runs.map(run => (run.time?.elapsed ?? NaN) * 1000)
  return { project, point, kind, dir, hyperfine: hyperfine?.results?.[0] ?? null, times, runs }
}

function wallStats(point) {
  let times = point.times.filter(Number.isFinite)
  if (times.length === 0) return null
  return {
    median: median(times),
    min: Math.min(...times),
    max: Math.max(...times),
    stddev: point.hyperfine?.stddev !== undefined && point.hyperfine.stddev !== null ? point.hyperfine.stddev * 1000 : null,
    n: times.length,
  }
}

function sameCounts(runs) {
  let keys = runs
    .filter(run => run.report !== null)
    .map(run => JSON.stringify(run.report.counts))
  return new Set(keys).size <= 1
}

function cell(value) {
  return value === null || value === undefined ? '–' : String(value)
}

let projects = existsSync(root)
  ? readdirSync(root).filter(name => statSync(path.join(root, name)).isDirectory() && !['setup', 'snapshots', 'profiles', 'smoke'].includes(name))
  : []
let out = []
out.push(`# Результаты бенчмарка`, '', `Каталог: \`${root}\`; воркеров: ${workers}. Определения метрик — analysis/bench/README.md, раздел «Метрики».`, '')
for (let project of projects.sort()) {
  let points = readdirSync(path.join(root, project))
    .filter(name => statSync(path.join(root, project, name)).isDirectory())
    .sort()
    .map(point => describePoint(project, point))
  out.push(`## ${project}`, '')
  out.push('| точка | прогонов | wall, с: медиана [min–max] | σ, с | CPU, с | RSS max проц., МБ | PSS дерева, МБ | мутантов: всего / с вердиктом / запущено | Killed | Survived | NoCov | Timeout | Error | Ignored | из кэша | полезных | с/мутант | с/запущ. | с/полезный | одинаковые счётчики |')
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (let point of points) {
    let wall = wallStats(point)
    let first = point.runs.find(run => run.report !== null)?.report ?? null
    let cpu = median(point.runs.map(run => (run.time ? (run.time.user + run.time.sys) * 1000 : NaN)))
    let rss = median(point.runs.map(run => (run.time ? run.time.maxrss_kb / 1024 : NaN)))
    let pss = median(point.runs.map(run => (run.mem ? run.mem.peak.pssKb / 1024 : NaN)))
    let row = [
      point.point,
      wall?.n ?? 0,
      wall ? `${seconds(wall.median)} [${seconds(wall.min)}–${seconds(wall.max)}]` : '–',
      wall?.stddev !== null && wall?.stddev !== undefined ? seconds(wall.stddev) : '–',
      seconds(cpu),
      fixed(rss, 0),
      fixed(pss, 0),
    ]
    if (first !== null) {
      let c = first.counts
      let verdict = first.all - c.Ignored
      let executed = c.Killed + c.Survived + c.Timeout + c.Error - first.cached
      let useful = c.Survived + c.NoCoverage
      row.push(
        `${first.all} / ${verdict} / ${executed}`,
        ...STATUSES.map(status => cell(c[status])),
        cell(first.cached),
        useful,
        wall && verdict > 0 ? fixed(wall.median / 1000 / verdict, 2) : '–',
        wall && executed > 0 ? fixed(wall.median / 1000 / executed, 2) : '–',
        wall && useful > 0 ? fixed(wall.median / 1000 / useful, 2) : '–',
        sameCounts(point.runs) ? 'да' : '**нет**',
      )
    } else {
      row.push(...new Array(13).fill('–'))
    }
    out.push(`| ${row.join(' | ')} |`)
  }
  out.push('')
  let mootant = points.filter(point => point.kind === 'mootant' && point.runs.some(run => run.report))
  if (mootant.length > 0) {
    out.push('Фазы Mootant (медианы по прогонам, с; «вне total» = wall − total: запуск node, загрузка модулей, печать отчёта, закрытие Vitest и удаление рабочего каталога):', '')
    out.push('| точка | startup | dryRun | batch | isolated | total | вне total | доля dry run | запусков раннера (dry/batch/isolated) | юнитов | с/юнит (со стартом процесса) | старт процесса / юнит, мс |')
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|')
    for (let point of mootant) {
      let reports = point.runs.map(run => run.report).filter(Boolean)
      let phase = name => median(reports.map(report => report.phases?.[name] ?? NaN))
      let total = phase('total')
      let wall = wallStats(point)
      let first = reports[0]
      let runs = first.runs ?? {}
      let startup = first.units > 0 ? (first.unitMs - first.mutantMs) / first.units : null
      out.push(
        `| ${point.point} | ${seconds(phase('startup'))} | ${seconds(phase('dryRun'))} | ${seconds(phase('batch'))} | ${seconds(phase('isolated'))} | ${seconds(total)} | ${wall && total !== null ? seconds(wall.median - total) : '–'} | ${wall && total ? percent(phase('dryRun') / total) : '–'} | ${runs.dry ?? 0}/${(runs.batch ?? 0) + (runs.recovery ?? 0) + (runs.confirmation ?? 0)}/${runs.isolated ?? 0} | ${first.units} | ${first.units ? fixed(first.unitMs / first.units / 1000, 2) : '–'} | ${fixed(startup, 0)} |`,
      )
    }
    out.push('')
    let traced = mootant.filter(point => point.runs.some(run => run.units))
    if (traced.length > 0) {
      out.push(`Загрузка воркеров в раундах isolated/batch (по трассе рабочего каталога, медианы; занятость = Σ(done−start)/(${workers}·wall раундов), ожидание = Σ(start−claim)/(${workers}·wall), хвост = доля wall раундов после последнего момента, когда работали все ${workers} слота):`, '')
      out.push('| точка | раундов | юнитов | wall раундов, с | занятость | ожидание очереди файла | хвост | загрузка / юнит, мс | тесты / юнит, мс | юнит (worker), мс | dry: доля загрузки | CPU трассировщика, мс |')
      out.push('|---|---|---|---|---|---|---|---|---|---|---|---|')
      for (let point of traced) {
        let totals = point.runs.map(run => run.units?.totals).filter(Boolean)
        let m = name => median(totals.map(total => total[name] ?? NaN))
        out.push(
          `| ${point.point} | ${fixed(m('rounds'), 0)} | ${fixed(m('units'), 0)} | ${seconds(m('roundWallMs'))} | ${percent(m('busyShare'))} | ${percent(m('waitShare'))} | ${percent(m('tailShare'))} | ${fixed(m('unitLoadMs'), 0)} | ${fixed(m('unitTestsMs'), 0)} | ${fixed(m('unitMs'), 0)} | ${percent(m('dryLoadShare'))} | ${fixed(m('tracerCpuMs'), 0)} |`,
        )
      }
      out.push('')
    }
  }
  let stryker = points.filter(point => point.kind === 'stryker' && point.runs.some(run => run.report))
  if (stryker.length > 0) {
    out.push('Фазы Stryker (поле performance отчёта, медианы, с):', '')
    out.push('| точка | setup | initialRun | mutation | вне фаз | доля initialRun | static-мутантов | CompileError |')
    out.push('|---|---|---|---|---|---|---|---|')
    for (let point of stryker) {
      let reports = point.runs.map(run => run.report).filter(Boolean)
      let phase = name => median(reports.map(report => report.phases?.[name] ?? NaN))
      let wall = wallStats(point)
      let sumPhases = ['setup', 'initialRun', 'mutation'].map(phase).reduce((a, b) => (a ?? 0) + (b ?? 0), 0)
      out.push(
        `| ${point.point} | ${seconds(phase('setup'))} | ${seconds(phase('initialRun'))} | ${seconds(phase('mutation'))} | ${wall ? seconds(wall.median - sumPhases) : '–'} | ${wall ? percent(phase('initialRun') / wall.median) : '–'} | ${reports[0].statics} | ${reports[0].compileErrors} |`,
      )
    }
    out.push('')
  }
}
console.log(out.join('\n'))
