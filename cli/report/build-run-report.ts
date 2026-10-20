import type {
  RunReportMutant,
  RunReportTest,
  RunReport,
} from '../../types/report/run-report'
import type { RunResult } from '../../types/run/run-result'
import type { RunStatus } from '../../types/run/run-status'
import type { DryTest } from '../../types/adapter/dry-test'

import { getDisplayPath } from '../../core/run/get-display-path'
import { computeScore } from '../../core/run/compute-score'
import { buildListReport } from './build-list-report'

/**
 * Statuses of the mutants to act on, the only ones a report lists unless it
 * lists every mutant.
 */
const ACTIONABLE_STATUSES = new Set<RunStatus>([
  'NoCoverage',
  'Survived',
  'Error',
])

/**
 * Most test files a mutant of the report names in `testFiles`, besides the file
 * of its first covering test.
 */
const MAX_TEST_FILES = 3

/**
 * What a run report holds beyond the result.
 */
interface RunReportOptions {
  /**
   * Command line before `--mutant` that runs mutants of the same paths again,
   * such as `mootant run src --preset strict`.
   */
  recheck: string

  /**
   * Whether to list every mutant, not only the ones to act on.
   */
  all: boolean
}

/**
 * Turns the result of a run into the report that every formatter reads: the
 * list report's positions, fragments, source lines and sorted diagnostics, plus
 * each mutant's verdict, the test that kills it or, for a mutant not killed,
 * the tests that cover it with their count, its likeliest test files (at most
 * three, then the file of the first covering test when it ranks lower, with
 * their counts of covering tests) and the first covering test, the command that
 * runs it again, counts, scores and durations. Only the mutants to act on
 * (`Survived`, `NoCoverage`, `Error`) are listed unless every mutant is asked
 * for; the summary counts them all. Paths are relative to the project root.
 *
 * @param result - Outcome of the run.
 * @param options - Command line of a re-check and whether to list every mutant.
 * @returns Report with verdicts and the summary.
 */
export function buildRunReport(
  result: RunResult,
  options: RunReportOptions,
): RunReport {
  let list = buildListReport({
    diagnostics: result.diagnostics,
    mutators: result.mutators,
    preset: result.preset,
    since: result.since,
    files: result.files,
    skipped: false,
  })
  let verdicts = new Map(
    result.results.map(verdict => [verdict.mutant.id, verdict]),
  )
  let tests = new Map(
    result.tests.map(test => [test.id, createTestEntry(test, result.root)]),
  )
  let mutants = list.mutants.flatMap((entry): RunReportMutant[] => {
    let verdict = verdicts.get(entry.id)!
    if (!options.all && !ACTIONABLE_STATUSES.has(verdict.status)) {
      return []
    }
    let decided = verdict.status === 'Killed' || verdict.status === 'Timeout'
    let coveredBy = verdict.coveredBy.map(id => tests.get(id)!)
    return [
      {
        ...entry,
        killedIn:
          verdict.killedIn === null ?
            null
          : getDisplayPath(verdict.killedIn, result.root),
        recheck:
          verdict.status === 'Ignored' ?
            null
          : `${options.recheck} --mutant ${entry.id}`,
        testFiles:
          decided ? null : countTestFiles(verdict.testFiles, coveredBy, result),
        killedBy:
          verdict.killedBy === null ? null : tests.get(verdict.killedBy)!,
        test: decided ? null : (coveredBy[0] ?? null),
        tests: decided ? null : coveredBy.length,
        isolatedBecause: verdict.isolatedBecause,
        duration: Math.round(verdict.duration),
        coveredBy: decided ? null : coveredBy,
        message: verdict.message,
        cached: verdict.cached,
        status: verdict.status,
        cause: verdict.cause,
        path: verdict.path,
      },
    ]
  })

  let unrepeatable =
    result.unrepeatable === null ? null : new Set(result.unrepeatable)
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
      totalCached:
        result.cache ?
          result.results.filter(verdict => verdict.cached).length
        : null,
      totalUnrepeatableTests: unrepeatable === null ? null : unrepeatable.size,
      totalBatch: fast ? totalBatch : null,
      totalNoCoverage: counts.NoCoverage,
      totalMutants: list.mutants.length,
      totalErrorMutants: counts.Error,
      totalTests: result.tests.length,
      totalSurvived: counts.Survived,
      totalIgnored: counts.Ignored,
      totalTimeout: counts.Timeout,
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
    listed: options.all ? 'all' : 'actionable',
    runnerVersion: result.runnerVersion,
    diagnostics: list.diagnostics,
    mutators: list.mutators,
    runner: result.runner,
    preset: result.preset,
    since: result.since,
    mode: result.mode,
    files: list.files,
    schemaVersion: 3,
    command: 'run',
    mutants,
  }
}

/**
 * Counts the covering tests of a mutant in each of its likeliest test files and
 * in the file of its first covering test, which the report names as the test to
 * start from, when that file ranks lower.
 *
 * @param files - Absolute paths of its test files, the likeliest first.
 * @param coveredBy - Report entries of its covering tests, in the order of the
 *   files.
 * @param result - Outcome of the run, for the project root.
 * @returns Display paths of at most three files, then the file of the first
 *   covering test when it is not among them, in order, with their counts.
 */
function countTestFiles(
  files: readonly string[],
  coveredBy: readonly RunReportTest[],
  result: RunResult,
): Record<string, number> {
  let counts = new Map(
    files
      .slice(0, MAX_TEST_FILES)
      .map(file => [getDisplayPath(file, result.root), 0]),
  )
  let [first] = coveredBy
  if (first !== undefined && !counts.has(first.file)) {
    counts.set(first.file, 0)
  }
  for (let test of coveredBy) {
    let count = counts.get(test.file)
    if (count !== undefined) {
      counts.set(test.file, count + 1)
    }
  }
  return Object.fromEntries(counts)
}

/**
 * Builds the report entry of a test.
 *
 * @param test - Test of the dry run.
 * @param root - Project root.
 * @returns The entry with a display path.
 */
function createTestEntry(test: DryTest, root: string): RunReportTest {
  return {
    file: getDisplayPath(test.file, root),
    name: test.name,
    line: test.line,
  }
}
