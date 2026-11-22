// Prints one Markdown line per performance prompt: id, rank, title and the
// gain, effort and type from its header quote.
// Usage: node list-perf-prompts.mjs [--prefix <path>]
// The prefix goes before `PERF-NN.md` in the links (default `perf-prompts/`).
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

let root = path.resolve(import.meta.dirname, '..')
let prefixIndex = process.argv.indexOf('--prefix')
let prefix = prefixIndex === -1 ? 'perf-prompts/' : process.argv[prefixIndex + 1]

/**
 * Reads a field such as «Трудоёмкость: M.» from the header quote of a prompt.
 *
 * @param {string} quote - Header quote joined into one line.
 * @param {string} name - Field name.
 * @returns {string} The value without the final dot, or an empty string.
 */
function field(quote, name) {
  let match = new RegExp(`${name}:\\s*([^.]+(?:\\.\\d[^.]*)*)\\.`, 'u').exec(quote)
  return match === null ? '' : match[1].trim()
}

let items = readdirSync(path.join(root, 'perf-prompts'))
  .filter(name => /^PERF-\d+\.md$/u.test(name))
  .map(name => {
    let text = readFileSync(path.join(root, 'perf-prompts', name), 'utf8')
    let id = name.slice(0, -3)
    let title = (/^# PERF-\d+:?\s*(.+)$/mu.exec(text)?.[1] ?? '').trim()
    let quote = text
      .split('\n')
      .filter(line => line.startsWith('>'))
      .map(line => line.replace(/^>\s?/u, ''))
      .join(' ')
    return {
      effort: field(quote, 'Трудоёмкость'),
      rank: Number(id.slice(5)),
      kind: field(quote, 'Тип'),
      title,
      id,
    }
  })
  .toSorted((a, b) => a.rank - b.rank)

for (let item of items) {
  let details = [item.effort && `трудоёмкость ${item.effort}`, item.kind]
    .filter(Boolean)
    .join(', ')
  console.log(
    `- [${item.id}](${prefix}${item.id}.md) — ранг ${item.rank}${details ? ` (${details})` : ''}: ${item.title}`,
  )
}
