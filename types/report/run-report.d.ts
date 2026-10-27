import type { ListReportMutator } from './list-report-mutator'
import type { ListReportSkipped } from './list-report-skipped'
import type { ListReportMutant } from './list-report-mutant'
import type { IsolatedReason } from '../run/isolated-reason'
import type { SinceRevision } from '../git/since-revision'
import type { ListReportFile } from './list-report-file'
import type { RunDurations } from '../run/run-durations'
import type { Diagnostic } from '../mutant/diagnostic'
import type { ModuleCost } from '../run/module-cost'
import type { RunStatus } from '../run/run-status'
import type { TryCause } from '../run/try-cause'
import type { RunKind } from '../run/run-kind'
import type { RunMode } from '../run/run-mode'

/**
 * Mutant with its verdict, as an agent needs it.
 */
export interface RunReportMutant extends Omit<ListReportMutant, 'status'> {
  /**
   * Test files to extend with a test that kills the mutant, at most three, the
   * likeliest first: the file named after the module, then one that imports it,
   * then the others by how many of their tests reach it; the file of `test`
   * comes after them when it ranks lower, as when the files before it only load
   * the module. They are the files of the covering tests and of the test files
   * that reached the mutant while loading; for a mutant no test reaches, the
   * files named after its module, importing it or reaching its other mutants.
   * Each maps to the number of its covering tests, which may be 0. Null for a
   * mutant killed or timed out.
   */
  testFiles: Record<string, number> | null

  /**
   * Why it ran isolated in fast mode, or `static` when a test file reached it
   * while loading; null when it did not run isolated, and outside fast mode for
   * every other mutant, since every covered mutant runs isolated there.
   */
  isolatedBecause: IsolatedReason | null

  /**
   * How the verdict was reached, or null when nothing ran: `isolated` on a
   * fresh module graph, `batch` in a batch try of fast mode, whose kill or
   * timeout may be false: state an earlier try left can fail a test that the
   * mutant alone would pass.
   */
  path: 'isolated' | 'batch' | null

  /**
   * Tests that reach the mutant, by their test file in the order of the ranked
   * test files, then by line and name; null for a mutant killed or timed out,
   * which `killedBy` tells about.
   */
  coveredBy: RunReportTest[] | null

  /**
   * Test that failed on the mutant, or null.
   */
  killedBy: RunReportTest | null

  /**
   * First of `coveredBy`: the covering test to start from when writing one that
   * kills the mutant, in the likeliest test file that has one, which is among
   * `testFiles`; null when no test covers it or it was killed or timed out.
   */
  test: RunReportTest | null

  /**
   * Path of the test file of the verdict, relative to the project root with `/`
   * separators, or null.
   */
  killedIn: string | null

  /**
   * Command line that runs only this mutant again, with the paths and the
   * options that pick mutants of the run; null for an ignored mutant.
   */
  recheck: string | null

  /**
   * First line of the failure or of the reason of `Error`, or null.
   */
  message: string | null

  /**
   * How it was detected, or null when it was not.
   */
  cause: TryCause | null

  /**
   * Number of covering tests; null for a mutant killed or timed out.
   */
  tests: number | null

  /**
   * Final state.
   */
  status: RunStatus

  /**
   * Milliseconds spent on it, rounded.
   */
  duration: number

  /**
   * Whether the verdict came from an earlier run whose code, tests and settings
   * are unchanged; nothing ran it in this run.
   */
  cached: boolean
}

/**
 * Counts, scores and durations of a run.
 */
export interface RunReportSummary {
  /**
   * Test runner runs by kind; kinds that did not run are left out.
   */
  runs: Partial<Record<RunKind, number>>

  /**
   * Tests whose two dry tries differed in pass/fail or stray errors, or null
   * outside fast mode, which does not check.
   */
  totalUnrepeatableTests: number | null

  /**
   * Score over covered mutants, or null.
   */
  coveredScore: number | null

  /**
   * Mutants whose verdict came from the cache, or null when the cache was off.
   */
  totalCached: number | null

  /**
   * Mutants with status `Error`; not diagnostics.
   */
  totalErrorMutants: number

  /**
   * Mutants killed or timed out in a batch try of fast mode, whose verdicts may
   * be false (see `RunReport.mode`), or null outside fast mode.
   */
  totalBatch: number | null

  /**
   * Isolated cost per mutated source file, durations rounded, sorted by
   * duration descending.
   */
  staticCost: ModuleCost[]

  /**
   * Threshold from the options, or null.
   */
  threshold: number | null

  /**
   * Mutants with status `NoCoverage`.
   */
  totalNoCoverage: number

  /**
   * Milliseconds per phase, rounded.
   */
  duration: RunDurations

  /**
   * Mutants with status `Survived`.
   */
  totalSurvived: number

  /**
   * Mutants decided on the isolated path, static included.
   */
  totalIsolated: number

  /**
   * Diagnostics with the severity `warning`.
   */
  totalWarnings: number

  /**
   * Total score, or null.
   */
  score: number | null

  /**
   * Mutants with status `Ignored`.
   */
  totalIgnored: number

  /**
   * Mutants with status `Timeout`.
   */
  totalTimeout: number

  /**
   * Mutants of the report.
   */
  totalMutants: number

  /**
   * Mutants with status `Killed`.
   */
  totalKilled: number

  /**
   * Static mutants among the isolated ones.
   */
  totalStatic: number

  /**
   * Diagnostics with the severity `error`.
   */
  totalErrors: number

  /**
   * Tests the dry run ran.
   */
  totalTests: number

  /**
   * Mutated files.
   */
  totalFiles: number

  /**
   * Whether the run passes: no error diagnostics, no `Error` mutants, and the
   * score is not below the threshold.
   */
  passed: boolean
}

/**
 * Result of `mootant run`, shaped for AI agents. `--json --verbose` prints it
 * as is; `--json` prints its slim form (`SlimRunReport`).
 */
export interface RunReport {
  /**
   * Mutators the preset turned on.
   */
  mutators: ListReportMutator[]

  /**
   * Candidates that were considered and not emitted, in canonical order per
   * file; present only when the report asks for them, as the HTML report does.
   */
  skipped?: ListReportSkipped[]

  /**
   * Version of the test runner, or null when the adapter does not tell.
   */
  runnerVersion: string | null

  /**
   * Which mutants `mutants` holds: `actionable`, the default, or `all` with
   * `--all`. The summary counts every mutant either way.
   */
  listed: 'actionable' | 'all'

  /**
   * Revision given with `--since` and the merge-base commit the working tree
   * was compared with, or null without `--since`.
   */
  since: SinceRevision | null

  /**
   * Mutants of the mutated files, in file and canonical order: the ones to act
   * on (`Survived`, `NoCoverage`, `Error`), or every mutant when `listed` is
   * `all`.
   */
  mutants: RunReportMutant[]

  /**
   * Counts, scores and durations.
   */
  summary: RunReportSummary

  /**
   * Problems found while listing or running.
   */
  diagnostics: Diagnostic[]

  /**
   * Mutated files.
   */
  files: ListReportFile[]

  /**
   * Version of the report shape. It changes when a field changes meaning or is
   * removed; new fields do not change it.
   */
  schemaVersion: 3

  /**
   * Command that produced the report.
   */
  command: 'run'

  /**
   * Name of the adapter.
   */
  runner: string

  /**
   * Id of the preset used.
   */
  preset: string

  /**
   * How the run decided its mutants: `isolated`, the default, decides every
   * covered mutant on a fresh module graph; `fast` accepts kills and timeouts
   * of batch tries (`path: 'batch'`), which may be false because of state an
   * earlier try left.
   */
  mode: RunMode
}

/**
 * Test that covers or kills a mutant.
 */
export interface RunReportTest {
  /**
   * 1-based line, or null.
   */
  line: number | null

  /**
   * Path relative to the project root, `/` separators.
   */
  file: string

  /**
   * Full name, suites joined by `>`.
   */
  name: string
}
