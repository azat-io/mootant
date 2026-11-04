#!/usr/bin/env node
// Compares the verdicts of two Mootant JSON reports, a baseline and a
// prototype (`mootant run --json --all --verbose`), mutant by mutant (by id).
// Used for the equivalence checks of the speed-up prototypes (section 4,
// analysis/experiments/prototypes.md).
//
// Usage:
//   node compare-verdicts.mjs <base.json> <proto.json> [options]
// Options:
//   --strict        also compare the killing test (name and line) and the cause
//   --status-only   compare the status only, not the killing file
//   --json          print the result as JSON instead of Markdown
//   --label A,B     column names (default: base,proto)
//   --limit N       at most N rows in the table of differences (default 200)
// Exit code: 0 when every mutant of both reports agrees on the compared fields,
// 1 when something differs (or a mutant is only in one report), 2 on bad input.
//
// What is compared by default: `status` and the killing test file (`killedIn`,
// falling back to `killedBy.file`). A Killed/Timeout verdict depends on the
// first test file in rank order with evidence (core/run/decide-evidence.ts), so
// the killing file is part of a verdict, not noise. `cached`, `duration`,
// `message` are never compared: they legitimately differ between runs.
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Parses the command line.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @returns {{files: string[], strict: boolean, statusOnly: boolean, json: boolean, labels: string[], limit: number}}
 *   Options.
 */
function parseArguments(argv) {
  let options = {
    labels: ['base', 'proto'],
    statusOnly: false,
    strict: false,
    json: false,
    limit: 200,
    files: [],
  }
  for (let index = 0; index < argv.length; index++) {
    let argument = argv[index]
    if (argument === '--strict') {
      options.strict = true
    } else if (argument === '--status-only') {
      options.statusOnly = true
    } else if (argument === '--json') {
      options.json = true
    } else if (argument === '--label') {
      options.labels = String(argv[++index] ?? '').split(',')
    } else if (argument === '--limit') {
      options.limit = Number(argv[++index])
    } else if (argument.startsWith('--')) {
      fail(`unknown option ${argument}`)
    } else {
      options.files.push(argument)
    }
  }
  if (options.files.length !== 2 || options.labels.length !== 2) {
    fail('usage: compare-verdicts.mjs <base.json> <proto.json> [--strict] [--status-only] [--json] [--label A,B] [--limit N]')
  }
  return options
}

/**
 * Prints an error and exits with code 2.
 *
 * @param {string} message - What went wrong.
 * @returns {never} Never returns.
 */
function fail(message) {
  process.stderr.write(`compare-verdicts: ${message}\n`)
  process.exit(2)
}

/**
 * Reads a Mootant JSON report. Tolerates a byte order mark and text before the
 * first `{` (such as a progress line captured with the report).
 *
 * @param {string} file - Path of the report.
 * @returns {any} The report.
 */
function readReport(file) {
  let text
  try {
    text = readFileSync(file, 'utf8').replace(/^﻿/u, '')
  } catch (error) {
    fail(`cannot read ${file}: ${error.message}`)
  }
  let start = text.indexOf('{')
  try {
    let report = JSON.parse(start <= 0 ? text : text.slice(start))
    if (!Array.isArray(report.mutants)) {
      fail(`${file} has no "mutants" array: run mootant with --json --all`)
    }
    return report
  } catch (error) {
    fail(`${file} is not a JSON report: ${error.message}`)
  }
}

/**
 * Reduces a mutant of a report to the fields a verdict is compared on.
 *
 * @param {any} mutant - Mutant of a report.
 * @returns {{status: string, file: string | null, test: string | null, cause: string | null}}
 *   Verdict.
 */
function getVerdict(mutant) {
  let killedBy = mutant.killedBy ?? null
  return {
    file: mutant.killedIn ?? killedBy?.file ?? null,
    test:
      killedBy === null ? null : `${killedBy.name ?? '?'}:${killedBy.line ?? '?'}`,
    status: mutant.status,
    cause: mutant.cause ?? null,
  }
}

/**
 * Tells which compared fields of two verdicts differ.
 *
 * @param {ReturnType<typeof getVerdict>} left - Verdict of the base.
 * @param {ReturnType<typeof getVerdict>} right - Verdict of the prototype.
 * @param {ReturnType<typeof parseArguments>} options - What to compare.
 * @returns {string[]} Names of the fields that differ.
 */
function diffVerdicts(left, right, options) {
  let fields = ['status']
  if (!options.statusOnly) {
    fields.push('file')
  }
  if (options.strict) {
    fields.push('test', 'cause')
  }
  return fields.filter(field => left[field] !== right[field])
}

/**
 * Counts the mutants of a report by status.
 *
 * @param {any[]} mutants - Mutants of a report.
 * @returns {Record<string, number>} Count by status.
 */
function countStatuses(mutants) {
  let counts = {}
  for (let mutant of mutants) {
    counts[mutant.status] = (counts[mutant.status] ?? 0) + 1
  }
  return counts
}

/**
 * Escapes a value for a Markdown table cell.
 *
 * @param {unknown} value - Cell value.
 * @returns {string} Escaped text.
 */
function cell(value) {
  return String(value ?? '—')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
}

/**
 * Formats a verdict for a table cell.
 *
 * @param {ReturnType<typeof getVerdict> | null} verdict - Verdict, or null when
 *   the mutant is missing.
 * @param {boolean} strict - Whether the test and cause are shown.
 * @returns {string} Text of the cell.
 */
function formatVerdict(verdict, strict) {
  if (verdict === null) {
    return '(нет)'
  }
  let parts = [verdict.status]
  if (verdict.file !== null) {
    parts.push(`в ${verdict.file}`)
  }
  if (strict && verdict.test !== null) {
    parts.push(`тест ${verdict.test}`)
  }
  if (strict && verdict.cause !== null) {
    parts.push(`(${verdict.cause})`)
  }
  return parts.join(' ')
}

let options = parseArguments(process.argv.slice(2))
let [baseFile, protoFile] = options.files
let [baseLabel, protoLabel] = options.labels
let base = readReport(baseFile)
let proto = readReport(protoFile)
let baseMutants = new Map(base.mutants.map(mutant => [mutant.id, mutant]))
let protoMutants = new Map(proto.mutants.map(mutant => [mutant.id, mutant]))
let ids = [...new Set([...baseMutants.keys(), ...protoMutants.keys()])].toSorted()
let rows = []
let transitions = new Map()
let same = 0
for (let id of ids) {
  let left = baseMutants.get(id)
  let right = protoMutants.get(id)
  let leftVerdict = left === undefined ? null : getVerdict(left)
  let rightVerdict = right === undefined ? null : getVerdict(right)
  let differs =
    leftVerdict === null || rightVerdict === null ?
      ['missing']
    : diffVerdicts(leftVerdict, rightVerdict, options)
  let transition = `${leftVerdict?.status ?? '(нет)'} → ${rightVerdict?.status ?? '(нет)'}`
  transitions.set(transition, (transitions.get(transition) ?? 0) + 1)
  if (differs.length === 0) {
    same += 1
    continue
  }
  let mutant = left ?? right
  rows.push({
    location: `${mutant.file}:${mutant.line}:${mutant.column}`,
    mutator: mutant.mutator,
    [baseLabel]: leftVerdict,
    [protoLabel]: rightVerdict,
    fields: differs,
    id,
  })
}
let result = {
  summary: {
    [baseLabel]: {
      file: path.resolve(baseFile),
      statuses: countStatuses(base.mutants),
      mutants: base.mutants.length,
      score: base.summary?.score ?? null,
    },
    [protoLabel]: {
      file: path.resolve(protoFile),
      statuses: countStatuses(proto.mutants),
      mutants: proto.mutants.length,
      score: proto.summary?.score ?? null,
    },
    compared: options.strict ? 'status, file, test, cause'
    : options.statusOnly ? 'status'
    : 'status, file',
    differences: rows.length,
    equivalent: rows.length === 0,
    same,
  },
  transitions: Object.fromEntries(
    [...transitions].toSorted(([left], [right]) => left.localeCompare(right)),
  ),
  differences: rows,
}

if (options.json) {
  process.stdout.write(`${JSON.stringify(result, null, 1)}\n`)
} else {
  let lines = []
  let { summary } = result
  lines.push(
    `Сравнение вердиктов: ${baseLabel} = \`${baseFile}\`, ${protoLabel} = \`${protoFile}\``,
    '',
    `Сравниваемые поля: ${summary.compared}. Мутантов: ${baseLabel} ${summary[baseLabel].mutants}, ${protoLabel} ${summary[protoLabel].mutants}; совпало ${summary.same}, расхождений ${summary.differences}. **${summary.equivalent ? 'Эквивалентны' : 'НЕ эквивалентны'}.**`,
    '',
    `| статус | ${baseLabel} | ${protoLabel} |`,
    '|---|---:|---:|',
  )
  let statuses = [
    ...new Set([
      ...Object.keys(summary[baseLabel].statuses),
      ...Object.keys(summary[protoLabel].statuses),
    ]),
  ].toSorted()
  for (let status of statuses) {
    lines.push(
      `| ${status} | ${summary[baseLabel].statuses[status] ?? 0} | ${summary[protoLabel].statuses[status] ?? 0} |`,
    )
  }
  lines.push(
    `| score | ${summary[baseLabel].score ?? '—'} | ${summary[protoLabel].score ?? '—'} |`,
    '',
    'Переходы статусов (base → proto):',
    '',
  )
  for (let [transition, count] of Object.entries(result.transitions)) {
    lines.push(`- ${transition}: ${count}`)
  }
  if (rows.length > 0) {
    lines.push(
      '',
      `| id | место | мутатор | ${baseLabel} | ${protoLabel} | поля |`,
      '|---|---|---|---|---|---|',
    )
    for (let row of rows.slice(0, options.limit)) {
      lines.push(
        `| ${cell(row.id)} | ${cell(row.location)} | ${cell(row.mutator)} | ${cell(formatVerdict(row[baseLabel], options.strict))} | ${cell(formatVerdict(row[protoLabel], options.strict))} | ${cell(row.fields.join(', '))} |`,
      )
    }
    if (rows.length > options.limit) {
      lines.push('', `… и ещё ${rows.length - options.limit} (см. --json).`)
    }
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}
process.exitCode = rows.length === 0 ? 0 : 1
