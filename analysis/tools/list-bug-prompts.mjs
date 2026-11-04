// Prints one Markdown line per bug prompt: id, final severity, title.
// Usage: node list-bug-prompts.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

let root = path.resolve(import.meta.dirname, '..')
let rows = JSON.parse(
  execFileSync(process.execPath, [path.join(import.meta.dirname, 'consolidate-bugs.mjs'), '--json'], { encoding: 'utf8' }),
)
let decisions = new Map()
for (let line of readFileSync(path.join(root, 'data/verification/decisions.md'), 'utf8').split('\n')) {
  let match = /^\| (BUG-\d+) \|.*\| \*\*(critical|high|medium|low)\*\*/u.exec(line)
  if (match) {
    decisions.set(match[1], match[2])
  }
}
let duplicates = { 'BUG-503': 'BUG-601', 'BUG-504': 'BUG-601', 'BUG-602': 'BUG-901' }
let order = { critical: 0, high: 1, medium: 2, low: 3 }
let items = readdirSync(path.join(root, 'bug-prompts'))
  .filter(name => /^BUG-\d+\.md$/u.test(name))
  .map(name => {
    let id = name.slice(0, -3)
    let text = readFileSync(path.join(root, 'bug-prompts', name), 'utf8')
    let title = (/^# BUG-\d+:?\s*(.+)$/mu.exec(text)?.[1] ?? '').trim()
    let claimed = rows.find(row => row.id === id)?.severity?.replaceAll('*', '') ?? ''
    let severity = decisions.get(id) ?? (/(critical|high|medium|low)/u.exec(claimed)?.[1] ?? '?')
    return { id, title, severity }
  })
  .toSorted((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || a.id.localeCompare(b.id, 'en', { numeric: true }))
for (let item of items) {
  let dup = duplicates[item.id] ? ` (дубль ${duplicates[item.id]})` : ''
  console.log(`- [${item.id}](bug-prompts/${item.id}.md) — **${item.severity}**${dup}: ${item.title}`)
}
