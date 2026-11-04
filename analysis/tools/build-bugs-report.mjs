// Builds the consolidated bug table of analysis/02-bugs.md from the area files
// analysis/bugs/*.md, the verification decisions in
// analysis/data/verification/decisions.md and a manual list of duplicates.
// Usage: node build-bugs-report.mjs > table.md   (prints the table only)
//        node build-bugs-report.mjs --stats       (prints counts)
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

let root = path.resolve(import.meta.dirname, '..')

let ranges = {
  'instrumentation.md': [100, 199, 'инструментирование'],
  'verdicts.md': [200, 299, 'вердикты (оракул)'],
  'skips.md': [300, 399, 'эвристики пропуска'],
  'cache-since.md': [400, 499, 'кэш, --incremental, --since'],
  'cli-env.md': [500, 599, 'CLI, процессы, окружения'],
  'adapters.md': [600, 649, 'адаптеры'],
  'ux.md': [650, 699, 'UX и агенты'],
  'perf.md': [700, 749, 'производительность'],
  'perf-proto.md': [750, 799, 'прототипы ускорений'],
  'architecture.md': [800, 819, 'архитектура'],
  'release.md': [820, 849, 'совместимость и релиз'],
  'tests.md': [850, 899, 'тесты проекта'],
  'static-review.md': [900, 949, 'статический ревью'],
}

// Same defect found by several agents: duplicate id -> canonical id.
let duplicates = {
  'BUG-101': 'BUG-904',
  'BUG-205': 'BUG-507',
  'BUG-413': 'BUG-701',
  'BUG-418': 'BUG-600',
  'BUG-503': 'BUG-601',
  'BUG-504': 'BUG-601',
  'BUG-505': 'BUG-600',
  'BUG-602': 'BUG-901',
}

let order = { critical: 0, high: 1, medium: 2, low: 3 }

function splitRow(line) {
  let cells = []
  let current = ''
  for (let index = 1; index < line.length; index++) {
    let char = line[index]
    if (char === '\\' && line[index + 1] === '|') {
      current += '\\|'
      index++
    } else if (char === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  return cells
}

function mainTableRows(text) {
  let lines = text.split('\n')
  let start = lines.findIndex(
    line => /^\|\s*ID\s*\|/u.test(line) && /серь[её]зн/iu.test(line),
  )
  if (start === -1) {
    return []
  }
  let rows = []
  for (let line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) {
      break
    }
    rows.push(line)
  }
  return rows
}

function severityWord(text) {
  let match = /(critical|high|medium|low)/iu.exec(text.replaceAll('*', ''))
  return match === null ? '?' : match[1].toLowerCase()
}

let decisions = new Map()
let decisionsFile = path.join(root, 'data/verification/decisions.md')
if (existsSync(decisionsFile)) {
  for (let line of readFileSync(decisionsFile, 'utf8').split('\n')) {
    if (!/^\| BUG-\d+/u.test(line)) {
      continue
    }
    let [id, , reproduced, refuted, , final] = splitRow(line)
    decisions.set(id, {
      reproduced: reproduced.replace(/\s*\(.*$/u, ''),
      refuted,
      final: severityWord(final),
      label: final.replaceAll('*', ''),
    })
  }
}

let rows = []
for (let file of readdirSync(path.join(root, 'bugs')).filter(name =>
  name.endsWith('.md'),
)) {
  let [low, high, area] = ranges[file] ?? [0, 9999, file]
  let text = readFileSync(path.join(root, 'bugs', file), 'utf8')
  for (let line of mainTableRows(text)) {
    let match = /^\| (?:\*\*)?(BUG-(\d+))/u.exec(line)
    if (match === null) {
      continue
    }
    let number = Number(match[2])
    if (number < low || number > high) {
      continue
    }
    let [, description, severity, status, where, repro] = splitRow(line)
    let id = match[1]
    let claimed = severityWord(severity)
    let decision = decisions.get(id) ?? null
    let final = decision?.final ?? claimed
    let canonical = duplicates[id]
    rows.push({
      duplicate: canonical !== undefined && canonical !== id ? canonical : null,
      prompt: existsSync(path.join(root, 'bug-prompts', `${id}.md`)),
      description: description.replaceAll('**', ''),
      status: status.replaceAll('**', ''),
      decision,
      claimed,
      repro,
      where,
      final,
      area,
      file,
      id,
    })
  }
}

rows.sort(
  (a, b) =>
    (a.duplicate === null ? 0 : 1) - (b.duplicate === null ? 0 : 1) ||
    (order[a.final] ?? 9) - (order[b.final] ?? 9) ||
    a.id.localeCompare(b.id, 'en', { numeric: true }),
)

if (process.argv.includes('--stats')) {
  let unique = rows.filter(row => row.duplicate === null)
  let count = (list, key) =>
    Object.fromEntries(
      Object.entries(
        list.reduce((acc, row) => {
          acc[row[key]] = (acc[row[key]] ?? 0) + 1
          return acc
        }, {}),
      ).toSorted((a, b) => (order[a[0]] ?? 9) - (order[b[0]] ?? 9)),
    )
  console.log(
    JSON.stringify(
      {
        total: rows.length,
        unique: unique.length,
        duplicates: rows.length - unique.length,
        finalSeverity: count(unique, 'final'),
        claimedSeverity: count(unique, 'claimed'),
        verified: unique.filter(row => row.decision !== null).length,
        hypotheses: unique.filter(row => /гипотез/iu.test(row.status)).length,
        prompts: unique.filter(row => row.prompt).length,
        duplicatePrompts: rows
          .filter(row => row.duplicate !== null && row.prompt)
          .map(row => row.id),
        duplicateVerified: rows
          .filter(row => row.duplicate !== null && row.decision !== null)
          .map(row => row.id),
      },
      null,
      2,
    ),
  )
} else {
  console.log(
    '| ID | Итог | Заявлено | Статус | Перепроверка | Область | Описание | Где в коде | Как воспроизвести |',
  )
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (let row of rows) {
    let id = row.prompt ? `[${row.id}](bug-prompts/${row.id}.md)` : row.id
    let check =
      row.decision === null ? '—'
      : `воспр.: ${row.decision.reproduced}; опроверг.: ${row.decision.refuted}`
    let final = row.duplicate === null ? `**${row.final}**` : `дубль ${row.duplicate}`
    console.log(
      `| ${id} | ${final} | ${row.claimed} | ${row.status} | ${check} | ${row.area} | ${row.description} | ${row.where} | ${row.repro} |`,
    )
  }
}
