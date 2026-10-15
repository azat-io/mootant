import type {
  RunReportSummary,
  RunReportTest,
  RunReport,
} from '../types/report/run-report'
import type { RunKind } from '../types/run/run-kind'

import { formatChange } from './format-change'
import { pluralize } from './pluralize'

/**
 * Statuses of the mutants a report lists one by one: the ones to act on.
 */
const LISTED_STATUSES = new Set(['NoCoverage', 'Survived', 'Error'])

/**
 * Order of run kinds on the `Runs:` line.
 */
const RUN_KINDS: RunKind[] = [
  'dry',
  'batch',
  'recovery',
  'confirmation',
  'isolated',
]

/**
 * Reasons of the mutants that went to the isolated path after batch tries.
 */
const AFTER_BATCH = new Set(['batch-survivor', 'recovery', 'doubtful'])

/**
 * Share of the total time the isolated phase must exceed before the report
 * names the most expensive modules.
 */
const STATIC_COST_SHARE = 0.25

/**
 * Most modules named on the `Static cost:` line.
 */
const STATIC_COST_MODULES = 3

/**
 * Formats a run report as plain text: one aligned line per mutant to act on
 * (`Survived`, `NoCoverage`, `Error`), with the covering test of a survivor or
 * the reason of an error on the next line, then the summary: counts, score, in
 * fast mode how many verdicts came from batch tries and may be false, time,
 * test runner runs and, when isolated units took more than a quarter of the
 * time, the source files whose mutants cost the most. Killed, timed-out and
 * ignored mutants are only counted.
 *
 * @param report - Report of a run.
 * @returns Plain text without colors.
 */
export function formatRunTextReport(report: RunReport): string {
  let tests = new Map(report.tests.map(test => [test.id, test]))
  let listed = report.mutants.filter(mutant =>
    LISTED_STATUSES.has(mutant.status),
  )
  let rows = listed.map(mutant => ({
    location: `${mutant.file}:${mutant.line}:${mutant.column}`,
    details: getDetails(mutant, tests),
    change: formatChange(mutant),
    mutator: mutant.mutator,
    status: mutant.status,
    id: mutant.id,
  }))
  let widths = { location: 0, mutator: 0, status: 0, id: 0 }
  for (let row of rows) {
    widths.location = Math.max(widths.location, row.location.length)
    widths.mutator = Math.max(widths.mutator, row.mutator.length)
    widths.status = Math.max(widths.status, row.status.length)
    widths.id = Math.max(widths.id, row.id.length)
  }
  let indent = ' '.repeat(widths.location + 2)
  let lines = rows.flatMap(row => [
    `${row.location.padEnd(widths.location)}  ${row.id.padEnd(widths.id)}  ${row.status.padEnd(widths.status)}  ${row.mutator.padEnd(widths.mutator)}  ${row.change}`,
    ...row.details.map(detail => `${indent}${detail}`),
  ])
  let summary = [formatCounts(report), formatScore(report.summary)]
  let { totalBatch } = report.summary
  if (totalBatch !== null) {
    summary.push(
      `Fast mode: ${totalBatch === 1 ? '1 kill or timeout comes' : `${totalBatch} kills and timeouts come`} from batch tries and may be false; run without --fast to confirm.`,
    )
  }
  summary.push(formatTime(report), formatRuns(report.summary.runs))
  let { staticCost, duration } = report.summary
  if (
    staticCost.length > 0 &&
    duration.isolated > duration.total * STATIC_COST_SHARE
  ) {
    let modules = staticCost
      .slice(0, STATIC_COST_MODULES)
      .map(
        cost =>
          `${cost.file} ${formatSeconds(cost.duration)} (${pluralize(cost.mutants, 'static mutant')}, ${pluralize(cost.units, 'unit')})`,
      )
    summary.push(`Static cost: ${modules.join(', ')}`)
  }
  let sections = lines.length > 0 ? [lines.join('\n')] : []
  sections.push(summary.join('\n'))
  return sections.join('\n\n')
}

/**
 * Formats the line that counts mutants by status, naming mutants without a
 * verdict and diagnostics only when there are some.
 *
 * @param report - Report of a run.
 * @returns One line of text.
 */
function formatCounts(report: RunReport): string {
  let { summary } = report
  let text = `${pluralize(summary.totalMutants, 'mutant')} in ${pluralize(summary.totalFiles, 'file')}: ${summary.totalKilled} killed, ${summary.totalTimeout} timeout, ${summary.totalSurvived} survived, ${summary.totalNoCoverage} no coverage, ${summary.totalIgnored} ignored`
  if (summary.totalErrorMutants > 0) {
    text += `, ${summary.totalErrorMutants} without verdict`
  }
  if (summary.totalErrors > 0) {
    text += `, ${pluralize(summary.totalErrors, 'error')}`
  }
  if (summary.totalWarnings > 0) {
    text += `, ${pluralize(summary.totalWarnings, 'warning')}`
  }
  return `${text} (preset: ${report.preset}, runner: ${report.runner}, mode: ${report.mode})`
}

/**
 * Formats the time line with the duration of every phase; the batch phase only
 * in fast mode, with the mutants batch runs tried: those decided there and
 * those sent on to the isolated path after their batch tries.
 *
 * @param report - Report of a run.
 * @returns One line of text.
 */
function formatTime(report: RunReport): string {
  let { summary } = report
  let { duration } = summary
  let batch = ''
  if (duration.batch !== null) {
    let tried = report.mutants.filter(
      mutant =>
        mutant.path === 'batch' ||
        AFTER_BATCH.has(mutant.isolatedBecause ?? ''),
    ).length
    batch = `, batch ${formatSeconds(duration.batch)} for ${pluralize(tried, 'mutant')}`
  }
  return `Time: ${formatSeconds(duration.total)} (start ${formatSeconds(duration.startup)}, dry run ${formatSeconds(duration.dryRun)}${batch}, isolated ${formatSeconds(duration.isolated)} for ${pluralize(summary.totalIsolated, 'mutant')})`
}

/**
 * Builds the lines under a listed mutant: the first covering test of a
 * survivor, or the reason of an error.
 *
 * @param mutant - Listed mutant.
 * @param mutant.coveredBy - Ids of its covering tests.
 * @param mutant.message - Reason of an error.
 * @param mutant.status - Final state.
 * @param tests - Tests of the report by id.
 * @returns Lines without indentation, possibly none.
 */
function getDetails(
  mutant: RunReport['mutants'][number],
  tests: ReadonlyMap<string, RunReportTest>,
): string[] {
  if (mutant.status === 'Error') {
    return mutant.message === null ? [] : [mutant.message]
  }
  let [first] = mutant.coveredBy
  if (first === undefined) {
    return []
  }
  let test = tests.get(first)!
  let where = test.line === null ? test.file : `${test.file}:${test.line}`
  let more = mutant.coveredBy.length - 1
  return [
    `covered by ${test.name} (${where})${more > 0 ? ` and ${more} more` : ''}`,
  ]
}

/**
 * Formats the score line with the threshold check when there is a threshold.
 *
 * @param summary - Counts of the run.
 * @returns One line of text.
 */
function formatScore(summary: RunReportSummary): string {
  if (summary.score === null) {
    return 'Mutation score: none (no mutants to score)'
  }
  let text = `Mutation score: ${summary.score}% (covered ${summary.coveredScore === null ? 'none' : `${summary.coveredScore}%`})`
  if (summary.threshold !== null) {
    let verdict = summary.score >= summary.threshold ? 'passed' : 'failed'
    text += `, threshold ${summary.threshold}%: ${verdict}`
  }
  return text
}

/**
 * Formats the line that counts test runner runs by kind, in the order they
 * happen.
 *
 * @param runs - Runs by kind.
 * @returns One line of text.
 */
function formatRuns(runs: RunReportSummary['runs']): string {
  let parts = RUN_KINDS.filter(kind => runs[kind] !== undefined).map(
    kind => `${runs[kind]} ${kind}`,
  )
  return parts.length === 0 ? 'Runs: none' : `Runs: ${parts.join(', ')}`
}

/**
 * Formats milliseconds as seconds with one decimal.
 *
 * @param milliseconds - Duration.
 * @returns Text such as `1.3 s`.
 */
function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)} s`
}
