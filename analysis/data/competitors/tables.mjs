#!/usr/bin/env node
// Prints the Markdown tables of section 3, "Эмпирическая проверка", from the
// outputs of compare.mjs (summary.json, review.csv, sample.csv).
// Usage: node tables.mjs > tables.md
import { readFileSync } from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const summary = JSON.parse(readFileSync(path.join(HERE, 'summary.json'), 'utf8'))
const projects = summary.projects

function parseCsv(text) {
  let rows = []
  let lines = text.trim().split('\n')
  let head = lines[0].split(',')
  for (let line of lines.slice(1)) {
    let cells = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      let c = line[i]
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (c === '"') quoted = false
        else cur += c
      } else if (c === ',') {
        cells.push(cur)
        cur = ''
      } else if (c === '"') quoted = true
      else cur += c
    }
    cells.push(cur)
    rows.push(Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ''])))
  }
  return rows
}
const review = parseCsv(readFileSync(path.join(HERE, 'review.csv'), 'utf8'))

const fmt = (n, digits = 1) => (n === null || n === undefined || Number.isNaN(n) ? '—' : n.toFixed(digits).replace('.', ','))
const pct = (a, b) => (b === 0 ? '—' : `${Math.round((100 * a) / b)} %`)
const sum = list => list.reduce((a, b) => a + b, 0)
const table = (head, rows) =>
  [`| ${head.join(' | ')} |`, `| ${head.map((h, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n')
const s1 = p => p.counts.mootant.statuses[0]
const t1 = p => p.counts.stryker.statuses[0]
const useful = c => (c.Survived ?? 0) + (c.NoCoverage ?? 0)
const killed = c => (c.Killed ?? 0) + (c.Timeout ?? 0)

console.log('## Мутанты и статусы (прогон 1; детерминизм — по 3 прогонам)\n')
console.log(
  table(
    ['проект', 'Mootant: мутантов', 'Killed', 'Timeout', 'Survived', 'NoCoverage', 'score', 'Stryker: мутантов', 'Killed', 'Timeout', 'Survived', 'NoCoverage', 'Runtime/CompileError', 'score', 'разных вердиктов в 3 прогонах (M / S)'],
    projects.map(p => {
      let m = s1(p)
      let s = t1(p)
      let errors = (s.RuntimeError ?? 0) + (s.CompileError ?? 0)
      return [
        p.project, p.counts.mootant.total, m.Killed ?? 0, m.Timeout ?? 0, m.Survived ?? 0, m.NoCoverage ?? 0, pct(killed(m), p.counts.mootant.total - (m.Ignored ?? 0)),
        p.counts.stryker.total, s.Killed ?? 0, s.Timeout ?? 0, s.Survived ?? 0, s.NoCoverage ?? 0, errors, pct(killed(s) + errors, p.counts.stryker.total),
        `${p.determinism.mootantDiffering.length} / ${p.determinism.strykerDiffering.length}`,
      ]
    }),
  ),
)

console.log('\n## Мутаторы (все проекты; в скобках — Survived + NoCoverage)\n')
for (let tool of ['mootant', 'stryker']) {
  let totals = {}
  let usefulTotals = {}
  for (let p of projects) {
    for (let [k, v] of Object.entries(p.counts[tool].byMutator)) totals[k] = (totals[k] ?? 0) + v
    for (let [k, v] of Object.entries(p.counts[tool].usefulByMutator)) usefulTotals[k] = (usefulTotals[k] ?? 0) + v
  }
  console.log(`${tool}: ${Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} (${usefulTotals[k] ?? 0})`).join(', ')}\n`)
}

console.log('## Сопоставление мутантов Stryker с Mootant\n')
console.log(
  table(
    ['проект', 'Stryker', 'двойник среди мутантов Mootant: точно', 'приближённо', 'только среди пропусков Mootant: точно', 'приближённо', 'нет у Mootant', 'мутантов Mootant с двойником у Stryker', 'неуверенных пар'],
    projects.map(p => {
      let mm = p.matching
      let uncertain = mm.strykerMatchedToMootant.approx + mm.strykerMatchedToSkippedOnly.approx
      let pairs = mm.strykerMatchedToMootant.exact + mm.strykerMatchedToMootant.approx + mm.strykerMatchedToSkippedOnly.exact + mm.strykerMatchedToSkippedOnly.approx
      return [
        p.project, p.counts.stryker.total,
        `${mm.strykerMatchedToMootant.exact} (${pct(mm.strykerMatchedToMootant.exact, p.counts.stryker.total)})`, mm.strykerMatchedToMootant.approx,
        `${mm.strykerMatchedToSkippedOnly.exact} (${pct(mm.strykerMatchedToSkippedOnly.exact, p.counts.stryker.total)})`, mm.strykerMatchedToSkippedOnly.approx,
        `${mm.strykerUnmatched} (${pct(mm.strykerUnmatched, p.counts.stryker.total)})`,
        `${mm.mootantMatched} из ${p.counts.mootant.total} (${pct(mm.mootantMatched, p.counts.mootant.total)})`,
        `${uncertain} из ${pairs} (${pct(uncertain, pairs)})`,
      ]
    }),
  ),
)
let approx = {}
let unmatched = {}
for (let p of projects) {
  for (let [k, v] of Object.entries(p.matching.approxRules)) approx[k] = (approx[k] ?? 0) + v
  for (let [k, v] of Object.entries(p.matching.strykerUnmatchedByMutator)) unmatched[k] = (unmatched[k] ?? 0) + v
}
console.log(`\nприближённые правила: ${JSON.stringify(approx)}`)
console.log(`нет у Mootant, по мутаторам Stryker: ${Object.entries(unmatched).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}\n`)

console.log('## Полезные мутанты Stryker (Survived + NoCoverage): классы\n')
console.log(
  table(
    ['проект', 'Stryker useful', '(а) есть у Mootant', 'из них у Mootant тоже useful', '(б) Mootant пропустил', 'из них владелец Mootant выжил', '(в) Mootant не создаёт', 'из них внутри выживает мутант Mootant'],
    projects.map(p => {
      let u = p.strykerUseful
      let b = u.byClass.b ?? 0
      let c = u.byClass.c ?? 0
      return [p.project, u.total, u.byClass.a ?? 0, u.a.mootantUseful, b, `${u.b.ownerStatus.useful ?? 0}`, c, u.c.gapVisible]
    }),
  ),
)
let bRules = {}
let cMutators = {}
for (let p of projects) {
  for (let [k, v] of Object.entries(p.strykerUseful.b.byRule)) bRules[k] = (bRules[k] ?? 0) + v
  for (let [k, v] of Object.entries(p.strykerUseful.c.byMutator)) cMutators[k] = (cMutators[k] ?? 0) + v
}
console.log(`\n(б) по правилам (* — эвристика): ${Object.entries(bRules).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`)
console.log(`(в) по мутаторам Stryker: ${Object.entries(cMutators).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}\n`)

console.log('## Ручной разбор: Stryker (б) и (в)\n')
const verdicts = ['equivalent', 'noise', 'same-gap', 'lost']
let strykerRows = review.filter(r => r.set !== 'mootant-only')
console.log(
  table(
    ['проект', 'класс', 'разобрано', 'эквивалентен', 'шум', 'тот же пробел виден', 'потерян'],
    [...new Set(strykerRows.map(r => `${r.project}|${r.set}`))].sort().map(key => {
      let [project, set] = key.split('|')
      let rows = strykerRows.filter(r => r.project === project && r.set === set)
      return [project, set === 'stryker-b' ? '(б)' : '(в)', rows.length, ...verdicts.map(v => rows.filter(r => r.verdict === v).length)]
    }),
  ),
)
console.log(`\nвсего: ${strykerRows.length}; ${verdicts.map(v => `${v} ${strykerRows.filter(r => r.verdict === v).length}`).join(', ')}; в выборке: ${verdicts.map(v => `${v} ${strykerRows.filter(r => r.sampled === 'true' && r.verdict === v).length}`).join(', ')}\n`)

console.log('## Ручной разбор: только у Mootant\n')
const mv = ['useful', 'equivalent', 'noise']
let mootRows = review.filter(r => r.set === 'mootant-only')
console.log(
  table(
    ['проект', 'Mootant-only useful', 'разобрано', ...mv],
    projects.map(p => {
      let rows = mootRows.filter(r => r.project === p.project)
      return [p.project, p.mootantUseful.only, rows.length, ...mv.map(v => rows.filter(r => r.verdict === v).length)]
    }),
  ),
)
let byMutator = {}
for (let r of mootRows) {
  byMutator[r.mutator] ??= { useful: 0, equivalent: 0, noise: 0 }
  byMutator[r.mutator][r.verdict]++
}
console.log(`\nпо мутаторам: ${Object.entries(byMutator).map(([k, v]) => `${k} ${v.useful}/${v.equivalent}/${v.noise}`).join(', ')} (useful/equivalent/noise)`)
let onlyBy = {}
for (let p of projects) for (let [k, v] of Object.entries(p.mootantUseful.onlyByMutator)) onlyBy[k] = (onlyBy[k] ?? 0) + v
console.log(`Mootant-only useful по мутаторам (все): ${Object.entries(onlyBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}\n`)

console.log('## Время (hyperfine, 3 прогона)\n')
console.log(
  table(
    ['проект', 'Mootant, с (mean ± σ)', 'Stryker, с (mean ± σ)', 'M / S', 'CPU M, с', 'CPU S, с', 'с/мутант M', 'с/мутант S', 'с/useful M', 'с/useful S'],
    projects.map(p => {
      let m = p.timing.mootant
      let s = p.timing.stryker
      return [
        p.project, `${fmt(m.mean)} ± ${fmt(m.stddev)}`, `${fmt(s.mean)} ± ${fmt(s.stddev)}`, fmt(m.mean / s.mean, 2),
        fmt(m.user + m.system, 0), fmt(s.user + s.system, 0),
        fmt(m.perMutant, 2), fmt(s.perMutant, 2), fmt(m.perUseful, 2), fmt(s.perUseful, 2),
      ]
    }),
  ),
)
console.log('\nфазы Mootant (run 1, с): ' + projects.map(p => {
  let d = p.timing.mootant.phases[0]
  return `${p.project}: startup ${fmt(d.startup / 1000)}, dry ${fmt(d.dryRun / 1000)}, isolated ${fmt(d.isolated / 1000)}, total ${fmt(d.total / 1000)}, раундов ${p.timing.mootant.runs[0].isolated}`
}).join('; '))
console.log('фазы Stryker (run 1, с): ' + projects.map(p => {
  let d = p.timing.stryker.phases[0]
  return d ? `${p.project}: setup ${d.setup}, initial ${d.initialRun}, mutation ${d.mutation}` : `${p.project}: —`
}).join('; '))
console.log('стоимость юнитов Mootant по статусам (run 1): ' + projects.map(p => {
  let u = p.timing.mootant.unitCost
  if (!u || Object.keys(u.byStatus).length === 0) return `${p.project}: нет трассы (node:test)`
  return `${p.project}: ${Object.entries(u.byStatus).map(([k, v]) => `${k} ${v.mutants} мут., ${v.units} юн., ${fmt(v.busySeconds, 0)} с`).join('; ')}`
}).join(' | '))

// Sample tables: the stratified sample (sampled = true in review.csv).
const cell = text => text.replace(/\|/g, '\\|').replace(/[\r\n\t]+\s*/g, ' ').trim()
const code = (text, max = 48, keepSpaces = false) => {
  let t = (keepSpaces ? text.replace(/[\r\n\t]+\s*/g, ' ') : text.replace(/\s+/g, ' ')).trim()
  if (t.length > max) t = `${t.slice(0, max - 1)}…`
  return `\`${t.replace(/`/g, 'ˋ').replace(/\|/g, '\\|')}\``
}
const VERDICT = { equivalent: 'эквивалентен', noise: 'шум', 'same-gap': 'тот же пробел виден', lost: '**потерян**', useful: 'полезен' }
console.log('\n## Выборка: Stryker (б) и (в)\n')
console.log('| # | проект | место | мутация Stryker | что сделал Mootant | вердикт | обоснование |')
console.log('| ---: | --- | --- | --- | --- | --- | --- |')
review
  .filter(r => r.sampled === 'true' && r.set !== 'mootant-only')
  .forEach((r, i) => {
    let id = r.key.split(':').pop()
    let did = r.mootant.startsWith('skipped ') ? `пропустил: \`${r.mootant.slice(8)}\`` : 'не создаёт'
    console.log(`| ${i + 1} | ${r.project} | \`${r.place}\` | ${r.mutator} #${id}: ${code(r.original, 40)} → ${code(r.replacement, 28)} | ${did} | ${VERDICT[r.verdict] ?? r.verdict} | ${cell(r.why)}${r.test ? ` Тест: ${code(r.test, 160, true)}` : ''} |`)
  })
console.log('\n## Выборка: только у Mootant\n')
console.log('| # | проект | место | мутатор: мутация | выживший Stryker в том же месте | вердикт | обоснование |')
console.log('| ---: | --- | --- | --- | --- | --- | --- |')
review
  .filter(r => r.sampled === 'true' && r.set === 'mootant-only')
  .forEach((r, i) => {
    console.log(`| ${i + 1} | ${r.project} | \`${r.place}\` | ${r.mutator}: ${code(r.original, 40)} → ${code(r.replacement, 28)} | ${r.strykerUsefulAround ? cell(r.strykerUsefulAround.split('; ').map(x => x.split(' ').slice(0, 2).join(' ')).join(', ')) : '—'} | ${VERDICT[r.verdict] ?? r.verdict} | ${cell(r.why)}${r.test ? ` Тест: ${code(r.test, 160, true)}` : ''} |`)
  })

// Totals over the projects, for the conclusions.
{
  let t = (f) => sum(projects.map(f))
  let total = {
    mootantMutants: t(p => p.counts.mootant.total),
    strykerMutants: t(p => p.counts.stryker.total),
    mootantUseful: t(p => p.mootantUseful.total),
    strykerUseful: t(p => p.strykerUseful.total),
    a: t(p => p.strykerUseful.byClass.a ?? 0),
    aMootantUseful: t(p => p.strykerUseful.a.mootantUseful),
    b: t(p => p.strykerUseful.byClass.b ?? 0),
    c: t(p => p.strykerUseful.byClass.c ?? 0),
    exact: t(p => p.matching.strykerMatchedToMootant.exact + p.matching.strykerMatchedToSkippedOnly.exact),
    approx: t(p => p.matching.strykerMatchedToMootant.approx + p.matching.strykerMatchedToSkippedOnly.approx),
    unmatched: t(p => p.matching.strykerUnmatched),
    mootantOnlyUseful: t(p => p.mootantUseful.only),
    mootantOnlyUsefulOverlap: t(p => p.mootantUseful.onlyStrykerUsefulOverlap),
    disagreements: t(p => p.disagreements.total),
  }
  let audit = {}
  for (let p of projects) for (let [k, v] of Object.entries(p.skipAudit)) {
    let a = (audit[k] ??= { twins: 0, alsoEmitted: 0, strykerStatuses: {} })
    a.twins += v.twins
    a.alsoEmitted += v.alsoEmitted
    for (let [st, n] of Object.entries(v.strykerStatuses)) a.strykerStatuses[st] = (a.strykerStatuses[st] ?? 0) + n
  }
  let auditOnly = Object.values(audit).map(a => a.twins - a.alsoEmitted)
  let auditUseful = Object.values(audit).map(a => (a.strykerStatuses.Survived ?? 0) + (a.strykerStatuses.NoCoverage ?? 0))
  console.log('\n## Итоги по всем проектам\n')
  console.log(JSON.stringify(total))
  console.log(`пропуски Mootant с двойником у Stryker (без дублей выданных мутантов): ${sum(auditOnly)}, из них у Stryker выжили ${sum(auditUseful)}`)
  console.log(
    table(
      ['правило (* — эвристика)', 'двойников у Stryker', 'из них дубли выданного мутанта', 'Killed/Timeout у Stryker', 'Survived/NoCoverage у Stryker'],
      Object.entries(audit)
        .sort((a, b) => b[1].twins - a[1].twins)
        .map(([k, a]) => [k, a.twins, a.alsoEmitted, (a.strykerStatuses.Killed ?? 0) + (a.strykerStatuses.Timeout ?? 0) + (a.strykerStatuses.RuntimeError ?? 0), (a.strykerStatuses.Survived ?? 0) + (a.strykerStatuses.NoCoverage ?? 0)]),
    ),
  )
}
