// Writes analysis/02-bugs.md: head, counts, the consolidated table and tail.
// Usage: node analysis/tools/build-bugs-docs.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

let tools = import.meta.dirname
let root = path.resolve(tools, '..')
let run = (...args) =>
  execFileSync(process.execPath, [path.join(tools, 'build-bugs-report.mjs'), ...args], {
    encoding: 'utf8',
  })
let stats = JSON.parse(run('--stats'))
let table = run()
let head = readFileSync(path.join(tools, 'bugs-report-head.md'), 'utf8')
let tail = readFileSync(path.join(tools, 'bugs-report-tail.md'), 'utf8')
let final = stats.finalSeverity
let extra = ids =>
  ids.length === 0
    ? ''
    : ` (и ещё ${ids.length} у дублей: ${ids.join(', ')})`
let counts = [
  '## Счётчики',
  '',
  `- Строк в таблицах областей: ${stats.total}, из них уникальных багов ${stats.unique}, дублей ${stats.duplicates}.`,
  `- Итоговая серьёзность уникальных: critical — ${final.critical ?? 0}, high — ${final.high ?? 0}, medium — ${final.medium ?? 0}, low — ${final.low ?? 0}.`,
  `- Заявленная агентами: ${Object.entries(stats.claimedSeverity)
    .map(([key, value]) => `${key} — ${value}`)
    .join(', ')}.`,
  `- Перепроверено независимыми агентами: ${stats.verified} уникальных${extra(stats.duplicateVerified)}; гипотез: ${stats.hypotheses}.`,
  `- Самодостаточных промптов у уникальных багов: ${stats.prompts}${extra(stats.duplicatePrompts)}.`,
  '',
  '## Таблица',
  '',
  'Сортировка: сначала уникальные баги по итоговой серьёзности, затем дубли. ID',
  'со ссылкой — есть промпт `bug-prompts/BUG-XXX.md`.',
  '',
].join('\n')
writeFileSync(
  path.join(root, '02-bugs.md'),
  `${head.trimEnd()}\n\n${counts}\n${table.trimEnd()}\n${tail}`,
)
console.log(`02-bugs.md: ${stats.unique} unique bugs`)
