import type {
  RunReportSummary,
  RunReportMutant,
  RunReport,
} from '../../types/report/run-report'
import type { TextStyle } from '../../types/cli/text-style'
import type { RunStatus } from '../../types/run/run-status'
import type { DiffEntry } from '../diff/format-diff-groups'
import type { RunKind } from '../../types/run/run-kind'

import { formatDiffGroups } from '../diff/format-diff-groups'
import { getSymbols } from '../terminal/get-symbols'
import { sortByLocation } from './sort-by-location'
import { formatDuration } from './format-duration'
import { wrapText } from '../terminal/wrap-text'
import { formatHeader } from './format-header'
import { formatFields } from './format-fields'
import { pluralize } from './pluralize'

/**
 * How a run report is printed as text.
 */
export interface RunTextOptions {
  /**
   * Whether to add the covering tests of survivors and the runs of the test
   * runner.
   */
  verbose: boolean

  /**
   * Colors, width and symbols of the output.
   */
  style: TextStyle

  /**
   * Characters ids are cut to: the shortest that tells apart every mutant of
   * the paths, so a printed id still names one mutant with `--mutant`.
   */
  idLength: number

  /**
   * Command line before `--mutant` in the hint to re-check one mutant: the
   * paths and the options that pick mutants, such as `mootant run src`.
   */
  recheck: string

  /**
   * Command of the run, for the header, such as `mootant run src --fast`.
   */
  command: string
}

/**
 * Sections of the mutants to act on, in the order they are printed.
 */
const SECTIONS: {
  color: 'greenBright' | 'yellow' | 'red'
  status: RunStatus
  title: string
}[] = [
  { color: 'greenBright', status: 'Survived', title: 'survived' },
  { status: 'NoCoverage', title: 'no coverage', color: 'yellow' },
  { status: 'Error', title: 'errors', color: 'red' },
]

/**
 * Order of run kinds on the `runs` line.
 */
const RUN_KINDS: RunKind[] = [
  'dry',
  'batch',
  'recovery',
  'confirmation',
  'isolated',
]

/**
 * Share of the total time the isolated phase must exceed before the report
 * names the most expensive modules.
 */
const STATIC_COST_SHARE = 0.25

/**
 * Most modules named on the `most test time` line.
 */
const STATIC_COST_MODULES = 3

/**
 * Milliseconds a run must take before the report names the most expensive
 * modules: in a short run they are not worth a look.
 */
const STATIC_COST_TIME = 30_000

/**
 * Formats a run report as text: a header with the command and the test runner;
 * the dry run, the mutants with how many were ignored or reused from the cache,
 * and time; the counts by status and the score; a section for each status to
 * act on (`survived`, `no coverage`, `errors`) with its count and its mutants
 * grouped by file, each as a diff of its source lines under a heading with the
 * location, mutator and short id, the reason of an error under the diff; and a
 * hint to re-check the first survivor, else the first listed mutant. Killed,
 * timed-out and ignored mutants are only counted. In fast mode a note tells how
 * many verdicts came from batch tries and may be false; when a run of half a
 * minute or more spent more than a quarter of its time in isolated units, the
 * source files whose mutants took the largest share of the isolated test time
 * are named. Verbose output adds the covering tests of survivors and the runs
 * of the test runner.
 *
 * @param report - Report of a run.
 * @param options - Command, hint, id length, style and verbosity.
 * @returns Text, with colors when the style has them.
 */
export function formatRunTextReport(
  report: RunReport,
  options: RunTextOptions,
): string {
  let { idLength, style } = options
  let { summary } = report
  let { colors } = style
  let note =
    report.runnerVersion === null ?
      report.runner
    : `${report.runner} ${report.runnerVersion}`
  let sections = [
    formatFields(getRunFields(report, options.verbose), style),
    formatCounts(summary, style),
  ]
  let listed = sortByLocation(
    report.mutants.filter(mutant =>
      SECTIONS.some(section => section.status === mutant.status),
    ),
  )
  for (let section of SECTIONS) {
    let entries = listed
      .filter(mutant => mutant.status === section.status)
      .map((mutant): DiffEntry => ({
        details: getDetails(mutant, options.verbose),
        id: mutant.id.slice(0, idLength),
        mutant,
      }))
    if (entries.length > 0) {
      sections.push(
        `${colors.bold(colors[section.color](section.title))} ${entries.length}`,
        formatDiffGroups(entries, style),
      )
    }
  }
  if (listed.length > 0) {
    let recheck =
      listed.find(mutant => mutant.status === 'Survived') ?? listed[0]!
    sections.push(
      `${colors.gray('re-check one:')} ${options.recheck} --mutant ${recheck.id.slice(0, idLength)}`,
    )
  }
  let body = sections.join('\n\n')
  return `${formatHeader({ command: options.command, note }, body, style)}\n\n${body}`
}

/**
 * Builds the fields about the work of the run: dry run, mutants, time and, when
 * they matter, the most expensive modules and the runs of the test runner.
 *
 * @param report - Report of a run.
 * @param verbose - Whether to add the runs of the test runner.
 * @returns Label and value pairs.
 */
function getRunFields(
  report: RunReport,
  verbose: boolean,
): [label: string, value: string][] {
  let { summary } = report
  let { duration } = summary
  let ignored =
    summary.totalIgnored > 0 ? `, ${summary.totalIgnored} ignored` : ''
  let cached =
    summary.totalCached !== null && summary.totalCached > 0 ?
      `, ${summary.totalCached} cached`
    : ''
  let phases = [
    `start ${formatDuration(duration.startup)}`,
    `dry run ${formatDuration(duration.dryRun)}`,
    ...(duration.batch === null ?
      []
    : [`batch ${formatDuration(duration.batch)}`]),
    `isolated ${formatDuration(duration.isolated)}`,
  ]
  let fields: [label: string, value: string][] = [
    [
      'dry run',
      `${pluralize(summary.totalTests, 'test')} in ${formatDuration(duration.dryRun)}`,
    ],
    [
      'mutants',
      `${summary.totalMutants} in ${pluralize(summary.totalFiles, 'file')}${ignored}${cached}`,
    ],
    [
      'time',
      `${formatDuration(duration.total)}${report.mode === 'fast' ? ' in fast mode' : ''} (${phases.join(', ')})`,
    ],
  ]
  let { staticCost } = summary
  if (
    staticCost.length > 0 &&
    duration.total >= STATIC_COST_TIME &&
    duration.isolated > duration.total * STATIC_COST_SHARE
  ) {
    let spent = Math.max(
      1,
      staticCost.reduce((sum, cost) => sum + cost.duration, 0),
    )
    fields.push([
      'most test time',
      staticCost
        .slice(0, STATIC_COST_MODULES)
        .map(
          cost => `${cost.file} ${Math.round((cost.duration / spent) * 100)}%`,
        )
        .join(', '),
    ])
  }
  if (verbose) {
    let runs = RUN_KINDS.filter(kind => summary.runs[kind] !== undefined).map(
      kind => `${summary.runs[kind]} ${kind}`,
    )
    fields.push(['runs', runs.length === 0 ? 'none' : runs.join(', ')])
  }
  return fields
}

/**
 * Formats the counts by status, the score and, in fast mode, the note about
 * verdicts of batch tries.
 *
 * @param summary - Counts of the run.
 * @param style - Colors and symbols of the output.
 * @returns Lines joined with line breaks.
 */
function formatCounts(summary: RunReportSummary, style: TextStyle): string {
  let { colors } = style
  let fields: [label: string, value: string][] = [
    ['killed', String(summary.totalKilled)],
    ['survived', colors.greenBright(summary.totalSurvived)],
    ['timeout', String(summary.totalTimeout)],
    ['no coverage', String(summary.totalNoCoverage)],
  ]
  if (summary.totalErrorMutants > 0) {
    fields.push(['error', colors.red(summary.totalErrorMutants)])
  }
  fields.push(['score', formatScore(summary, style)])
  let text = formatFields(fields, style)
  let { totalBatch } = summary
  if (totalBatch !== null && totalBatch > 0) {
    let sentence = `${totalBatch === 1 ? '1 kill or timeout comes' : `${totalBatch} kills and timeouts come`} from batch tries and may be false; run without --fast to confirm.`
    for (let line of wrapText(sentence, style.width)) {
      text += `\n${colors.gray(line)}`
    }
  }
  return text
}

/**
 * Formats the score with the covered score and the threshold check when there
 * is a threshold.
 *
 * @param summary - Counts of the run.
 * @param style - Colors and symbols of the output.
 * @returns Value of the score field.
 */
function formatScore(summary: RunReportSummary, style: TextStyle): string {
  let { colors } = style
  if (summary.score === null) {
    return `none ${colors.gray('(no mutants to score)')}`
  }
  let text = `${colors.bold(`${summary.score}%`)} ${colors.gray(`(covered ${summary.coveredScore === null ? 'none' : `${summary.coveredScore}%`})`)}`
  if (summary.threshold !== null) {
    let { cross, check } = getSymbols(style.unicode)
    text +=
      summary.score >= summary.threshold ?
        `  ${colors.green(`${check} threshold ${summary.threshold}%`)}`
      : `  ${colors.red(`${cross} below threshold ${summary.threshold}%`)}`
  }
  return text
}

/**
 * Builds the lines under a listed mutant: the reason of an error and, in
 * verbose output, the first covering test of a survivor.
 *
 * @param mutant - Listed mutant.
 * @param verbose - Whether to name the covering test.
 * @returns Lines without indentation, possibly none.
 */
function getDetails(mutant: RunReportMutant, verbose: boolean): string[] {
  if (mutant.status === 'Error') {
    return mutant.message === null ? [] : [mutant.message]
  }
  let [test] = mutant.coveredBy!
  if (!verbose || test === undefined) {
    return []
  }
  let where = test.line === null ? test.file : `${test.file}:${test.line}`
  let more = mutant.coveredBy!.length - 1
  return [
    `covered by ${test.name} (${where})${more > 0 ? ` and ${more} more` : ''}`,
  ]
}
