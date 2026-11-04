// Collects the bug tables of analysis/bugs/*.md into one list.
// Usage: node consolidate-bugs.mjs [verification.json] > out.md
// Rows are lines that start with "| BUG-"; cells are split on unescaped "|".
// Prints a Markdown table sorted by severity, then by id, plus JSON on demand.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

let root = path.resolve(import.meta.dirname, '..')
let verificationFile = process.argv[2]
let verification =
  verificationFile && existsSync(verificationFile) ?
    JSON.parse(readFileSync(verificationFile, 'utf8'))
  : {}

let areaNames = {
  'instrumentation.md': 'инструментирование',
  'verdicts.md': 'вердикты',
  'skips.md': 'эвристики пропуска',
  'cache-since.md': 'кэш и --since',
  'cli-env.md': 'CLI, процессы, окружения',
  'static-review.md': 'статический ревью',
  'adapters.md': 'адаптеры',
  'ux.md': 'UX',
  'perf.md': 'производительность',
  'tests.md': 'тесты проекта',
  'architecture.md': 'архитектура',
  'release.md': 'релиз и совместимость',
}
let severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }

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

let rows = []
let directory = path.join(root, 'bugs')
for (let file of readdirSync(directory).filter(name => name.endsWith('.md'))) {
  let seen = new Set()
  for (let line of readFileSync(path.join(directory, file), 'utf8').split('\n')) {
    if (!/^\| (\*\*)?BUG-/u.test(line)) {
      continue
    }
    let [id, description, severity, status, where, repro] = splitRow(line)
    let key = id.replaceAll('*', '').trim()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    let normalized = severity.toLowerCase().replaceAll('*', '').trim()
    rows.push({
      severity: normalized,
      area: areaNames[file] ?? file,
      prompt: existsSync(path.join(root, 'bug-prompts', `${key}.md`)),
      check: verification[key] ?? null,
      description,
      status,
      where,
      repro,
      file,
      id: key,
    })
  }
}
rows.sort(
  (a, b) =>
    (severityOrder[a.severity.split(/[ /]/u)[0]] ?? 9) -
      (severityOrder[b.severity.split(/[ /]/u)[0]] ?? 9) ||
    a.id.localeCompare(b.id, 'en', { numeric: true }),
)
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  console.log(
    '| ID | Серьёзность | Статус | Перепроверка | Область | Описание | Где в коде | Как воспроизвести |',
  )
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (let row of rows) {
    let id = row.prompt ? `[${row.id}](bug-prompts/${row.id}.md)` : row.id
    let check = row.check === null ? '—' : row.check
    console.log(
      `| ${id} | ${row.severity} | ${row.status} | ${check} | ${row.area} | ${row.description} | ${row.where} | ${row.repro} |`,
    )
  }
}
