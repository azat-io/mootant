#!/usr/bin/env node
// Prototype: turns `mootant run --json` output into GitHub Actions feedback.
// Not part of Mootant; written for analysis/06-ux-and-agents.md to check what
// a built-in `--format github` / `--sarif` reporter would need.
//
//   node mootant-github.mjs mootant.json \
//     [--summary "$GITHUB_STEP_SUMMARY"] [--comment comment.md] \
//     [--sarif mootant.sarif] [--rdjson mootant.rdjson] [--max 10]
//
// stdout: workflow commands (::warning/::error/::notice), at most --max per
// kind, since GitHub shows 10 warnings and 10 errors per step and 50
// annotations per job; the rest goes to the summary.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

let args = process.argv.slice(2)
let input = args[0] && !args[0].startsWith('--') ? args.shift() : '/dev/stdin'
let option = name => {
  let index = args.indexOf(`--${name}`)
  return index === -1 ? null : args[index + 1]
}
let report = JSON.parse(readFileSync(input, 'utf8'))
let max = Number(option('max') ?? 10)
let marker = '<!-- mootant-report -->'

let escapeData = text =>
  String(text).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
let escapeProperty = text =>
  escapeData(text).replaceAll(':', '%3A').replaceAll(',', '%2C')

let label = {
  NoCoverage: 'No test reaches this mutant',
  Survived: 'Surviving mutant',
  Error: 'Mutant error',
}
let level = { NoCoverage: 'warning', Survived: 'warning', Error: 'error' }
let order = { Survived: 0, NoCoverage: 1, Error: 2 }
let mutants = report.mutants
  .filter(mutant => mutant.status in label)
  .toSorted((a, b) => order[a.status] - order[b.status])

let diff = mutant => [
  ...mutant.before.map(line => `- ${line}`),
  ...mutant.after.map(line => `+ ${line}`),
]
let hint = mutant => {
  let files = Object.keys(mutant.testFiles ?? {})
  return [
    mutant.message ? `Reason: ${mutant.message}` : null,
    files.length > 0 ? `Extend: ${files.join(', ')}` : 'No test file reaches this code yet',
    mutant.test ? `Covering test: ${mutant.test.file}${mutant.test.line ? `:${mutant.test.line}` : ''} "${mutant.test.name}"` : null,
    mutant.recheck ? `Re-check: npx ${mutant.recheck}` : null,
  ].filter(Boolean)
}

// 1. Annotations.
let shown = { error: 0, warning: 0 }
let hidden = 0
for (let mutant of mutants) {
  let kind = level[mutant.status]
  if (shown[kind] >= max) {
    hidden++
    continue
  }
  shown[kind]++
  let title = `${label[mutant.status]}: ${mutant.mutator} (${mutant.id.slice(0, 4)})`
  let properties = [
    `file=${escapeProperty(mutant.file)}`,
    `line=${mutant.line}`,
    `col=${mutant.column}`,
    `endLine=${mutant.line + mutant.before.length - 1}`,
    `title=${escapeProperty(title)}`,
  ].join(',')
  console.log(`::${kind} ${properties}::${escapeData([...diff(mutant), '', ...hint(mutant)].join('\n'))}`)
}
if (hidden > 0) {
  console.log(`::notice title=Mootant::${hidden} more mutants are listed in the job summary.`)
}

// 2. Markdown for the job summary and a sticky PR comment.
let s = report.summary
let score = value => (value === undefined ? '–' : `${value}%`)
let lines = [
  marker,
  `### Mootant: ${s.passed ? 'passed' : 'failed'}, score ${score(s.score)}${s.threshold === undefined ? '' : ` (threshold ${s.threshold}%)`}`,
  '',
  report.since ? `Changed lines since \`${report.since.ref}\` (merge base \`${report.since.base.slice(0, 7)}\`).` : 'Whole run.',
  '',
  '| killed | timeout | survived | no coverage | errors | covered score | time |',
  '| --: | --: | --: | --: | --: | --: | --: |',
  `| ${s.totalKilled} | ${s.totalTimeout} | ${s.totalSurvived} | ${s.totalNoCoverage} | ${s.totalErrorMutants} | ${score(s.coveredScore)} | ${(s.duration.total / 1000).toFixed(1)} s |`,
  '',
]
for (let mutant of mutants) {
  lines.push(
    `<details><summary><code>${mutant.file}:${mutant.line}:${mutant.column}</code> ${mutant.status} · ${mutant.mutator} · <code>${mutant.id}</code></summary>`,
    '',
    '```diff',
    ...diff(mutant),
    '```',
    '',
    ...hint(mutant).map(line => `- ${line}`),
    '',
    '</details>',
    '',
  )
}
let markdown = `${lines.join('\n')}\n`
let summaryFile = option('summary')
if (summaryFile) appendFileSync(summaryFile, markdown)
let commentFile = option('comment')
if (commentFile) writeFileSync(commentFile, markdown)

// 3. SARIF 2.1.0 for code scanning (github/codeql-action/upload-sarif).
let sarifFile = option('sarif')
if (sarifFile) {
  let rules = [...new Set(mutants.map(mutant => mutant.mutator))]
  writeFileSync(sarifFile, JSON.stringify({
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'Mootant', informationUri: 'https://github.com/azat-io/mootant', rules: rules.map(id => ({ id, helpUri: `https://mootant.org/mutators/${id}` })) } },
      results: mutants.map(mutant => ({
        ruleId: mutant.mutator,
        level: level[mutant.status] === 'error' ? 'error' : 'warning',
        message: { text: `${label[mutant.status]}:\n${diff(mutant).join('\n')}\n${hint(mutant).join('\n')}` },
        partialFingerprints: { mootantMutantId: mutant.id },
        locations: [{ physicalLocation: { artifactLocation: { uri: mutant.file }, region: { startLine: mutant.line, startColumn: mutant.column } } }],
      })),
    }],
  }, null, 2))
}

// 4. Reviewdog Diagnostic Format (rdjson) for inline PR review comments.
let rdjsonFile = option('rdjson')
if (rdjsonFile) {
  writeFileSync(rdjsonFile, JSON.stringify({
    source: { name: 'mootant', url: 'https://github.com/azat-io/mootant' },
    diagnostics: mutants.map(mutant => ({
      message: `${label[mutant.status]} (${mutant.mutator}, ${mutant.id})\n${diff(mutant).join('\n')}\n${hint(mutant).join('\n')}`,
      location: { path: mutant.file, range: { start: { line: mutant.line, column: mutant.column } } },
      severity: level[mutant.status] === 'error' ? 'ERROR' : 'WARNING',
      code: { value: mutant.mutator, url: `https://mootant.org/mutators/${mutant.mutator}` },
    })),
  }, null, 2))
}
