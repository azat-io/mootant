import type { RunReportSummary, RunReportMutant, RunReport } from './run-report'
import type { SlimListReportMutant } from './slim-list-report'
import type { SinceRevision } from '../git/since-revision'
import type { RunDurations } from '../run/run-durations'
import type { Diagnostic } from '../mutant/diagnostic'
import type { TryCause } from '../run/try-cause'

/**
 * Mutant to act on (`Survived`, `NoCoverage`, `Error`) or ignored, as the slim
 * run report lists it: where it is, what it changes and how to write a test
 * that kills it.
 */
export interface SlimRunReportMutant extends Omit<
  SlimListReportMutant,
  'status'
> {
  /**
   * Final state.
   */
  status: Exclude<RunReportMutant['status'], 'Timeout' | 'Killed'>

  /**
   * Test files to extend with a test that kills the mutant, at most three, the
   * likeliest first, then the file of `test` when it ranks lower, each with its
   * number of covering tests, which may be 0 (see `RunReportMutant.testFiles`);
   * left out when there is none and for an ignored mutant.
   */
  testFiles?: Record<string, number>

  /**
   * Covering test to start from: the first one of the likeliest test file that
   * has one, among `testFiles`; left out when no test covers the mutant.
   */
  test?: SlimRunReportTest

  /**
   * First line of the reason of `Error`; left out when there is none.
   */
  message?: string

  /**
   * Command line that runs only this mutant again, with the paths and the
   * options that pick mutants of the run; left out for an ignored mutant.
   */
  recheck?: string

  /**
   * How it was detected; left out when it was not.
   */
  cause?: TryCause

  /**
   * Number of covering tests; left out for an ignored mutant.
   */
  tests?: number

  /**
   * `batch` for a verdict of a batch try of fast mode, which may be false; left
   * out otherwise.
   */
  path?: 'batch'
}

/**
 * Counts and scores of the slim run report. Fields that are null in the full
 * summary are left out.
 */
export interface SlimRunReportSummary extends Pick<
  RunReportSummary,
  | 'totalErrorMutants'
  | 'totalNoCoverage'
  | 'totalSurvived'
  | 'totalWarnings'
  | 'totalIgnored'
  | 'totalTimeout'
  | 'totalMutants'
  | 'totalKilled'
  | 'totalErrors'
  | 'totalTests'
  | 'totalFiles'
  | 'passed'
> {
  /**
   * Milliseconds of the whole run, rounded.
   */
  duration: Pick<RunDurations, 'total'>

  /**
   * Score over covered mutants; left out when there is none.
   */
  coveredScore?: number

  /**
   * Kills and timeouts of batch tries in fast mode, which may be false; left
   * out outside fast mode.
   */
  totalBatch?: number

  /**
   * Threshold from the options; left out without one.
   */
  threshold?: number

  /**
   * Total score; left out when there is none.
   */
  score?: number
}

/**
 * Result of `mootant run` as `--json` prints it: the fields of the full report
 * (`RunReport`) an agent needs to write killing tests, without offsets, timing,
 * cache and routing details, mutator descriptions, files, the full lists of
 * covering tests and fields that are null. Every field has the meaning it has
 * in the full report, which `--json --verbose` prints.
 */
export interface SlimRunReport extends Pick<
  RunReport,
  'runner' | 'listed' | 'preset' | 'mode'
> {
  /**
   * Mutants of the mutated files, in file and canonical order: the ones to act
   * on, or every mutant with `--all`, killed and timed-out ones shortened.
   */
  mutants: (SlimRunReportMutant | SlimRunReportKill)[]

  /**
   * Counts and scores.
   */
  summary: SlimRunReportSummary

  /**
   * Problems found while listing or running.
   */
  diagnostics: Diagnostic[]

  /**
   * Revision given with `--since` and its merge base; left out without it.
   */
  since?: SinceRevision

  /**
   * Version of the report shape, the same as of the full report.
   */
  schemaVersion: 3

  /**
   * Command that produced the report.
   */
  command: 'run'
}

/**
 * Killed or timed-out mutant, which the slim run report lists only with
 * `--all`.
 */
export interface SlimRunReportKill extends Pick<
  SlimListReportMutant,
  'mutator' | 'column' | 'file' | 'line' | 'id'
> {
  /**
   * Final state.
   */
  status: 'Timeout' | 'Killed'

  /**
   * Path of the test file of the verdict; left out when no test file decided
   * it.
   */
  killedIn?: string

  /**
   * `batch` for a verdict of a batch try of fast mode, which may be false; left
   * out otherwise.
   */
  path?: 'batch'
}

/**
 * Covering test of the slim run report.
 */
export interface SlimRunReportTest {
  /**
   * 1-based line; left out when the adapter does not tell.
   */
  line?: number

  /**
   * Path relative to the project root, `/` separators.
   */
  file: string

  /**
   * Full name, suites joined by `>`.
   */
  name: string
}
