// Checks the "## Changes" tables of docs/content/mutators/*.md against
// `mootant list --json`: every documented `code` -> `mutant` row should be a
// mutant of that mutator, under the recommended or the strict preset.
// usage: node check-mutator-docs.mjs <docs/content/mutators> <fixture dir> <out.json>
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

let [docsDir, fixture, outFile] = process.argv.slice(2)
let work = path.join(fixture, 'doccases')
rmSync(work, { recursive: true, force: true })

function splitRow(line) {
  let cells = []
  let cell = ''
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') { cell += '|'; i++; continue }
    if (line[i] === '|') { cells.push(cell); cell = ''; continue }
    cell += line[i]
  }
  cells.push(cell)
  return cells.slice(1, -1).map(c => c.trim())
}

function code(cell) {
  let m = /^`(.*)`$/u.exec(cell)
  return m ? m[1] : null
}

function complete(fragment) {
  let text = fragment
  if (/^case\s/u.test(text) || /^default:/u.test(text)) {
    text = `switch (value) {\n${text} break\n}`
  } else if (/^(?:if|while|for|switch)\s*\(.*\)$/u.test(text)) {
    text += ' {}'
  } else if (/^do\s*\{.*\}\s*while\s*\(.*\)$/u.test(text)) {
    // complete statement
  } else if (/^else\b/u.test(text)) {
    text = `if (condition) {} ${text}`
  }
  let stack = []
  let pairs = { '(': ')', '[': ']', '{': '}' }
  let quote = null
  for (let i = 0; i < text.length; i++) {
    let c = text[i]
    if (quote) { if (c === '\\') { i++; continue } if (c === quote) quote = null; continue }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '/' && text[i + 1] === '/') break
    if (pairs[c]) stack.push(pairs[c])
    else if (c === ')' || c === ']' || c === '}') stack.pop()
  }
  text += stack.reverse().join('')
  if (/^\s*(?:export|import)\b/u.test(fragment)) return text + '\n'
  let generator = /\byield\b/u.test(text) ? '*' : ''
  return `export async function${generator} documented() {\n${text}\n}\n`
}

let report = []
for (let page of readdirSync(docsDir).filter(f => f.endsWith('.md')).sort()) {
  let mutator = page.replace(/\.md$/u, '')
  let lines = readFileSync(path.join(docsDir, page), 'utf8').split('\n')
  let start = lines.findIndex(l => l.trim() === '## Changes')
  if (start === -1) continue
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  let rows = []
  for (let line of lines.slice(start + 1, end === -1 ? undefined : end)) {
    if (!line.startsWith('|') || /^\|\s*-/u.test(line)) continue
    let cells = splitRow(line)
    let [before, after] = cells.map(code)
    if (before === null || after === null || before === undefined || after === undefined) continue
    rows.push({ before, after })
  }
  let dir = path.join(work, mutator)
  mkdirSync(dir, { recursive: true })
  rows.forEach((row, i) => writeFileSync(path.join(dir, `case${String(i).padStart(2, '0')}.ts`), complete(row.before)))
  let found = {}
  for (let preset of ['recommended', 'strict']) {
    let out
    try {
      out = execFileSync('node', [path.join(fixture, 'node_modules/mootant/bin/mootant.js'), 'list', path.relative(fixture, dir), '--json', '--preset', preset], { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      out = error.stdout
      if (!out) {
        console.log(`! ${mutator} ${preset}: ${String(error.stderr).trim()}`)
        continue
      }
    }
    let json = JSON.parse(out)
    for (let m of json.mutants) {
      (found[m.file] ??= []).push({ preset, mutator: m.mutator, before: m.before.map(s => s.trim()).join(' '), after: m.after.map(s => s.trim()).join(' ') })
    }
    for (let d of json.diagnostics) (found[d.file] ??= []).push({ preset, diagnostic: d.message })
  }
  rows.forEach((row, i) => {
    let file = path.relative(fixture, path.join(dir, `case${String(i).padStart(2, '0')}.ts`))
    let candidates = found[file] ?? []
    let norm = s => s.replace(/\s+/gu, ' ').trim()
    let hit = candidates.find(c => c.mutator === mutator && norm(c.before).includes(norm(row.before.split('\n')[0])) && norm(c.after).includes(norm(row.after)))
    let loose = candidates.find(c => c.mutator === mutator && norm(c.after).includes(norm(row.after)))
    report.push({ mutator, file, before: row.before, after: row.after, ok: Boolean(hit || loose), presets: [...new Set(candidates.filter(c => c.mutator === mutator && norm(c.after).includes(norm(row.after))).map(c => c.preset))], produced: hit || loose ? undefined : candidates })
  })
}
writeFileSync(outFile, JSON.stringify(report, null, 1))
let bad = report.filter(r => !r.ok)
console.log(`rows: ${report.length}, matched: ${report.length - bad.length}, unmatched: ${bad.length}`)
for (let r of bad) console.log(`- ${r.mutator}: \`${r.before}\` -> \`${r.after}\` (${r.file}); produced: ${JSON.stringify(r.produced?.filter(c => c.mutator === r.mutator || c.diagnostic).map(c => c.diagnostic ?? `${c.preset}: ${c.after}`))}`)
