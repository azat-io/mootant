// Checks the "## Kill a surviving mutant" example of every mutator page: the
// first code block there is written to a file, listed with mootant, and every
// "`before` → `after`" pair in the prose of that section must be a mutant of
// the page's mutator (recommended preset; strict as a fallback, reported).
// usage: node check-kill-examples.mjs <docs/content/mutators> <fixture dir> <out.json>
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

let [docsDir, fixture, outFile] = process.argv.slice(2)
let work = path.join(fixture, 'killcases')
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })
let report = []
let norm = s => s.replace(/\s+/gu, ' ').trim()
for (let page of readdirSync(docsDir).filter(f => f.endsWith('.md')).sort()) {
  let mutator = page.replace(/\.md$/u, '')
  let text = readFileSync(path.join(docsDir, page), 'utf8')
  let start = text.indexOf('## Kill a surviving mutant')
  if (start === -1) continue
  let end = text.indexOf('\n## ', start + 5)
  let section = text.slice(start, end === -1 ? undefined : end)
  let block = /```(ts|js)\n([\s\S]*?)```/u.exec(section)
  if (!block) continue
  let file = path.join(work, `${mutator}.${block[1]}`)
  writeFileSync(file, block[2])
  let prose = section.slice(block.index + block[0].length)
  let firstTest = prose.indexOf('```')
  let claims = [...prose.slice(0, firstTest === -1 ? undefined : firstTest).matchAll(/`([^`]+)`\s*→\s*`([^`]+)`/gu)].map(m => ({ before: m[1], after: m[2] }))
  let produced = {}
  for (let preset of ['recommended', 'strict']) {
    let out = ''
    try {
      out = execFileSync('node', [path.join(fixture, 'node_modules/mootant/bin/mootant.js'), 'list', path.relative(fixture, file), '--json', '--verbose', '--preset', preset], { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) { out = error.stdout || '{"mutants":[],"diagnostics":[{"message":' + JSON.stringify(String(error.stderr)) + '}]}' }
    let json = JSON.parse(out)
    produced[preset] = json.mutants.map(m => ({ mutator: m.mutator, original: m.original, replacement: m.replacement, before: norm(m.before.join(' ')), after: norm(m.after.join(' ')) }))
    produced[preset + 'Diagnostics'] = json.diagnostics.map(d => d.message)
  }
  for (let claim of claims) {
    let match = preset => produced[preset].find(m => m.mutator === mutator && (norm(m.original) === norm(claim.before) || m.before.includes(norm(claim.before))) && (norm(m.replacement) === norm(claim.after) || m.after.includes(norm(claim.after))))
    let rec = match('recommended')
    let strict = match('strict')
    report.push({ mutator, claim, recommended: Boolean(rec), strict: Boolean(strict), ...(rec || strict ? {} : { produced: produced.recommended.filter(m => m.mutator === mutator).map(m => `${m.original} -> ${m.replacement}`), diagnostics: produced.recommendedDiagnostics }) })
  }
  if (claims.length === 0) report.push({ mutator, claim: null, note: 'no `a` → `b` claim found in the section prose' })
}
writeFileSync(outFile, JSON.stringify(report, null, 1))
for (let r of report) {
  let status = r.claim === null ? 'NO CLAIM' : r.recommended ? 'ok' : r.strict ? 'only strict' : 'MISSING'
  console.log(`${status.padEnd(11)} ${r.mutator}: ${r.claim ? `\`${r.claim.before}\` → \`${r.claim.after}\`` : r.note}${r.produced ? ` | produced: ${JSON.stringify(r.produced)} ${r.diagnostics?.length ? JSON.stringify(r.diagnostics) : ''}` : ''}`)
}
