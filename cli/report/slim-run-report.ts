import type {
  SlimRunReportMutant,
  SlimRunReportKill,
  SlimRunReport,
} from '../../types/report/slim-run-report'
import type { RunReportMutant, RunReport } from '../../types/report/run-report'

import { slimListMutant } from './slim-list-mutant'

/**
 * Shapes a run report as `--json` prints it: the counts and scores with the
 * total duration, the schema version, diagnostics, command, which mutants are
 * listed, runner, preset, mode, the `--since` revision when given and, last, so
 * that output cut short keeps the rest, the mutants. A mutant to act on or an
 * ignored one keeps its position, mutator, status, scope, source lines and
 * focus (`slimListMutant`), the ignore directive and its reason, the message
 * and cause of the verdict, `path` only for a batch verdict, the number of
 * covering tests, its likeliest test files, the first covering test and the
 * re-check command, each only when set. A killed or timed-out mutant, listed
 * with `--all`, keeps only its position, mutator, status, the test file that
 * killed it and a batch `path`. Fields that are null are left out; the full
 * report is what `--json --verbose` prints.
 *
 * @param report - Full report of a run.
 * @returns Report as `--json` prints it.
 */
export function slimRunReport(report: RunReport): SlimRunReport {
  let mutants = report.mutants.map(mutant => slimMutant(mutant))
  let { summary } = report
  return {
    summary: {
      ...(summary.coveredScore !== null && {
        coveredScore: summary.coveredScore,
      }),
      ...(summary.totalBatch !== null && { totalBatch: summary.totalBatch }),
      ...(summary.threshold !== null && { threshold: summary.threshold }),
      ...(summary.score !== null && { score: summary.score }),
      totalErrorMutants: summary.totalErrorMutants,
      duration: { total: summary.duration.total },
      totalNoCoverage: summary.totalNoCoverage,
      totalSurvived: summary.totalSurvived,
      totalWarnings: summary.totalWarnings,
      totalIgnored: summary.totalIgnored,
      totalTimeout: summary.totalTimeout,
      totalMutants: summary.totalMutants,
      totalKilled: summary.totalKilled,
      totalErrors: summary.totalErrors,
      totalTests: summary.totalTests,
      totalFiles: summary.totalFiles,
      passed: summary.passed,
    },
    schemaVersion: report.schemaVersion,
    diagnostics: report.diagnostics,
    command: report.command,
    listed: report.listed,
    runner: report.runner,
    preset: report.preset,
    mode: report.mode,
    ...(report.since !== null && { since: report.since }),
    mutants,
  }
}

/**
 * Shapes a mutant of a run report for the slim report.
 *
 * @param mutant - Mutant of the full report.
 * @returns The slim mutant: shortened when killed or timed out.
 */
function slimMutant(
  mutant: RunReportMutant,
): SlimRunReportMutant | SlimRunReportKill {
  let { status } = mutant
  let batch = mutant.path === 'batch' && { path: 'batch' as const }
  if (status === 'Killed' || status === 'Timeout') {
    return {
      ...(mutant.killedIn !== null && { killedIn: mutant.killedIn }),
      mutator: mutant.mutator,
      column: mutant.column,
      file: mutant.file,
      line: mutant.line,
      id: mutant.id,
      ...batch,
      status,
    }
  }
  let { test } = mutant
  return {
    ...slimListMutant({ ...mutant, status }),
    ...(Object.keys(mutant.testFiles!).length > 0 && {
      testFiles: mutant.testFiles!,
    }),
    ...(test !== null && {
      test: {
        ...(test.line !== null && { line: test.line }),
        file: test.file,
        name: test.name,
      },
    }),
    ...(status !== 'Ignored' && { tests: mutant.tests! }),
    ...(mutant.message !== null && { message: mutant.message }),
    ...(mutant.recheck !== null && { recheck: mutant.recheck }),
    ...(mutant.cause !== null && { cause: mutant.cause }),
    ...batch,
  }
}
