import type { ActiveMutator } from '../mutator/active-mutator'
import type { FileMutants } from '../mutant/file-mutants'
import type { Diagnostic } from '../mutant/diagnostic'
import type { RunDurations } from './run-durations'
import type { MutantResult } from './mutant-result'
import type { DryTest } from '../adapter/dry-test'
import type { ModuleCost } from './module-cost'
import type { RunKind } from './run-kind'
import type { RunMode } from './run-mode'

/**
 * Outcome of a run, before it is formatted.
 */
export interface RunResult {
  /**
   * Test runner runs by kind; kinds that did not run are left out.
   */
  runs: Partial<Record<RunKind, number>>

  /**
   * Ids of the tests whose two dry tries differed in pass/fail or had stray
   * errors, sorted; null outside fast mode, which tries each test once and does
   * not check.
   */
  unrepeatable: string[] | null

  /**
   * Problems of the run beyond those of listing a file: skipped paths, files
   * left out, instrumentation, unrepeatable tests and workers.
   */
  diagnostics: Diagnostic[]

  /**
   * Mutators the preset turned on.
   */
  mutators: ActiveMutator[]

  /**
   * Isolated cost per mutated source file: units run, their file time, and how
   * many of its mutants were static, by duration descending.
   */
  staticCost: ModuleCost[]

  /**
   * Bound the score was checked against, or null.
   */
  threshold: number | null

  /**
   * Verdicts of every mutant of `files`, in file and canonical order.
   */
  results: MutantResult[]

  /**
   * Durations of the phases.
   */
  timing: RunDurations

  /**
   * Mutated files with their mutants and diagnostics, sorted by path.
   */
  files: FileMutants[]

  /**
   * Tests the dry run saw.
   */
  tests: DryTest[]

  /**
   * Name of the adapter.
   */
  runner: string

  /**
   * Id of the preset used.
   */
  preset: string

  /**
   * How the run decided its mutants; in `fast` mode, kills with `path: 'batch'`
   * are heuristic.
   */
  mode: RunMode

  /**
   * Project root; display paths are relative to it.
   */
  root: string
}
