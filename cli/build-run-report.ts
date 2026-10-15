import type {
  RunReportMutant,
  RunReportTest,
  RunReport,
} from '../types/report/run-report'
import type { RunResult } from '../types/run/run-result'
import type { RunStatus } from '../types/run/run-status'
import type { DryTest } from '../types/adapter/dry-test'

import { getDisplayPath } from '../core/run/get-display-path'
import { compareCodeUnits } from '../core/compare-code-units'
import { computeScore } from '../core/run/compute-score'
import { buildListReport } from './build-list-report'

/**
 * Turns the result of a run into the report that every formatter reads: the
 * list report's positions, fragments and sorted diagnostics, plus each mutant's
 * verdict, the tests the verdicts refer to, counts, scores and durations. Paths
 * are relative to the project root.
 *
 * @param result - Outcome of the run.
 * @returns Report with verdicts, referenced tests and the summary.
 */
export function buildRunReport(result: RunResult): RunReport {
  let list = buildListReport({
    diagnostics: result.diagnostics,
    mutators: result.mutators,
    preset: result.preset,
    files: result.files,
    skipped: false,
  })
  let verdicts = new Map(
    result.results.map(verdict => [verdict.mutant.id, verdict]),
  )
  let referenced = new Set<string>()
  let mutants = list.mutants.map((entry): RunReportMutant => {
    let verdict = verdicts.get(entry.id)!
    for (let id of verdict.coveredBy) {
      referenced.add(id)
    }
    if (verdict.killedBy !== null) {
      referenced.add(verdict.killedBy)
    }
    return {
      ...entry,
      killedIn:
        verdict.killedIn === null ?
          null
        : getDisplayPath(verdict.killedIn, result.root),
      isolatedBecause: verdict.isolatedBecause,
      duration: Math.round(verdict.duration),
      coveredBy: verdict.coveredBy,
      killedBy: verdict.killedBy,
      message: verdict.message,
      status: verdict.status,
      cause: verdict.cause,
      path: verdict.path,
    }
  })

  let unrepeatable =
    result.unrepeatable === null ? null : new Set(result.unrepeatable)
  let tests = result.tests
    .filter(test => referenced.has(test.id))
    .map(test => createTestEntry(test, result.root, unrepeatable))
    .toSorted(compareTests)

  let counts: Record<RunStatus, number> = {
    NoCoverage: 0,
    Survived: 0,
    Ignored: 0,
    Timeout: 0,
    Killed: 0,
    Error: 0,
  }
  let totalIsolated = 0
  let totalStatic = 0
  let fast = result.mode === 'fast'
  let totalBatch = 0
  for (let verdict of result.results) {
    counts[verdict.status] += 1
    totalIsolated += Number(verdict.path === 'isolated')
    totalBatch += Number(
      verdict.path === 'batch' &&
        (verdict.status === 'Killed' || verdict.status === 'Timeout'),
    )
    totalStatic += Number(verdict.isolatedBecause === 'static')
  }
  let score = computeScore(result.results)
  let { totalWarnings, totalErrors, totalFiles } = list.summary

  return {
    summary: {
      duration: {
        batch:
          result.timing.batch === null ? null : Math.round(result.timing.batch),
        isolated: Math.round(result.timing.isolated),
        startup: Math.round(result.timing.startup),
        dryRun: Math.round(result.timing.dryRun),
        total: Math.round(result.timing.total),
      },
      passed:
        totalErrors === 0 &&
        counts.Error === 0 &&
        (score.total === null ||
          result.threshold === null ||
          score.total >= result.threshold),
      staticCost: result.staticCost.map(cost => ({
        ...cost,
        duration: Math.round(cost.duration),
      })),
      totalUnrepeatableTests: unrepeatable === null ? null : unrepeatable.size,
      totalBatch: fast ? totalBatch : null,
      totalNoCoverage: counts.NoCoverage,
      totalErrorMutants: counts.Error,
      totalSurvived: counts.Survived,
      totalIgnored: counts.Ignored,
      totalTimeout: counts.Timeout,
      totalMutants: mutants.length,
      threshold: result.threshold,
      coveredScore: score.covered,
      totalKilled: counts.Killed,
      score: score.total,
      runs: result.runs,
      totalIsolated,
      totalWarnings,
      totalErrors,
      totalStatic,
      totalFiles,
    },
    diagnostics: list.diagnostics,
    mutators: list.mutators,
    runner: result.runner,
    preset: result.preset,
    mode: result.mode,
    files: list.files,
    schemaVersion: 1,
    command: 'run',
    mutants,
    tests,
  }
}

/**
 * Builds the report entry of a test.
 *
 * @param test - Test of the dry run.
 * @param root - Project root.
 * @param unrepeatable - Ids of the tests whose two dry tries differed, or null
 *   outside fast mode, which does not check.
 * @returns The entry with a display path and the slower dry try's duration.
 */
function createTestEntry(
  test: DryTest,
  root: string,
  unrepeatable: ReadonlySet<string> | null,
): RunReportTest {
  return {
    duration: Math.round(Math.max(...test.tries.map(facts => facts.duration))),
    repeatable: unrepeatable === null ? null : !unrepeatable.has(test.id),
    file: getDisplayPath(test.file, root),
    name: test.name,
    line: test.line,
    id: test.id,
  }
}

/**
 * Orders tests by file, line and name; a missing line sorts first.
 *
 * @param left - Test expected first.
 * @param right - Test expected second.
 * @returns A negative number when `left` sorts first, a positive number when
 *   `right` sorts first and 0 when both are equal.
 */
function compareTests(left: RunReportTest, right: RunReportTest): number {
  return (
    compareCodeUnits(left.file, right.file) ||
    (left.line ?? 0) - (right.line ?? 0) ||
    compareCodeUnits(left.name, right.name)
  )
}
