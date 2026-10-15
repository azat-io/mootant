import type { ListReportMutator } from './list-report-mutator'
import type { ListReportMutant } from './list-report-mutant'
import type { IsolatedReason } from '../run/isolated-reason'
import type { ListReportFile } from './list-report-file'
import type { RunDurations } from '../run/run-durations'
import type { Diagnostic } from '../mutant/diagnostic'
import type { ModuleCost } from '../run/module-cost'
import type { RunStatus } from '../run/run-status'
import type { TryCause } from '../run/try-cause'
import type { RunKind } from '../run/run-kind'
import type { RunMode } from '../run/run-mode'

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
 * Mutant with its verdict, as an agent needs it.
 */
export interface RunReportMutant extends Omit<ListReportMutant, 'status'> {
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
   * Id of the killing test (see `tests`), or null.
   */
  killedBy: string | null

  /**
   * Path of the test file of the verdict, relative to the project root with `/`
   * separators, or null.
   */
  killedIn: string | null

  /**
   * First line of the failure or of the reason of `Error`, or null.
   */
  message: string | null

  /**
   * How it was detected, or null when it was not.
   */
  cause: TryCause | null

  /**
   * Ids of the covering tests (see `tests`), cheapest first.
   */
  coveredBy: string[]

  /**
   * Final state.
   */
  status: RunStatus

  /**
   * Milliseconds spent on it, rounded.
   */
  duration: number
}

/**
 * Result of `mootant run`, shaped for AI agents. `--json` prints it as is.
 */
export interface RunReport {
  /**
   * Mutators the preset turned on.
   */
  mutators: ListReportMutator[]

  /**
   * Every mutant of the mutated files, in file and canonical order.
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
   * Tests that some mutant refers to, sorted by file and line.
   */
  tests: RunReportTest[]

  /**
   * Version of the report shape.
   */
  schemaVersion: 1

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
 * Test referenced by a mutant of the report.
 */
export interface RunReportTest {
  /**
   * In fast mode, false when two dry tries without a mutant differed in
   * pass/fail or stray errors, so its mutants ran isolated; null outside fast
   * mode, where tests are tried once and not checked.
   */
  repeatable: boolean | null

  /**
   * 1-based line, or null.
   */
  line: number | null

  /**
   * Milliseconds of the slower dry try, rounded.
   */
  duration: number

  /**
   * Path relative to the project root, `/` separators.
   */
  file: string

  /**
   * Full name, suites joined by `>`.
   */
  name: string

  /**
   * Id the mutants refer to.
   */
  id: string
}
