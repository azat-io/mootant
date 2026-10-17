import type { Diagnostic } from '../mutant/diagnostic'
import type { RunCache } from '../cache/run-cache'
import type { DryAnalysis } from './dry-analysis'
import type { MutantState } from './mutant-state'
import type { RunEvent } from './run-event'
import type { RunKind } from './run-kind'

/**
 * Mutable state of the batch and isolated phases of one run.
 */
export interface RunState {
  /**
   * Test runner runs by kind; kinds that did not run are left out.
   */
  runs: Partial<Record<RunKind, number>>

  /**
   * Every pending mutant of the run by id, with its route and evidence.
   */
  mutants: Map<string, MutantState>

  /**
   * Receives the events of the run, such as the start of each run of the test
   * runner.
   */
  report(event: RunEvent): void

  /**
   * Problems found while running, such as hung or crashed workers.
   */
  diagnostics: Diagnostic[]

  /**
   * Verdicts of earlier runs to reuse and the evidence of this run to store, or
   * null when the cache is off.
   */
  cache: RunCache | null

  /**
   * Coverage and stability read from the dry run.
   */
  analysis: DryAnalysis

  /**
   * How try limits grow from the dry run.
   */
  limits: LimitSettings

  /**
   * Test files expected to run at once; a run that confirms timeouts uses half.
   */
  workers: number

  /**
   * Directory that display paths of diagnostics are relative to.
   */
  root: string
}

/**
 * One mutant planned in one test file on the isolated path.
 */
export interface IsolatedRequest {
  /**
   * Whether the unit confirms a timeout of an earlier unit.
   */
  confirming: boolean

  /**
   * Whether the unit already went missing once.
   */
  retried: boolean

  /**
   * Id of the mutant.
   */
  mutant: string

  /**
   * Key of the test file (`getTestFileKey`).
   */
  file: string
}

/**
 * How try limits grow from the dry run (see `RunConfig`), with defaults filled
 * in.
 */
export interface LimitSettings {
  /**
   * Per-try timeout: `ceil(factor × dry duration) + constant` milliseconds.
   */
  timeout: { constant: number; factor: number }

  /**
   * Hit limit per try: `max(floor, factor × dry hits)`.
   */
  hitLimit: { factor: number; floor: number }
}

/**
 * One mutant tried in one test of a batch plan.
 */
export interface PlannedTry {
  /**
   * Id of the mutant.
   */
  mutant: string

  /**
   * Id of the test.
   */
  test: string
}
