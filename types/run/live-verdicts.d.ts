import type { IsolatedPlan } from '../adapter/isolated-plan'
import type { IsolatedRequest } from './run-state'
import type { MutantState } from './mutant-state'
import type { RunStatus } from './run-status'

/**
 * Counts of decided mutants that the live progress of a run shows.
 */
export interface LiveVerdicts {
  /**
   * Isolated run in progress, with its requests and plan, so the facts of its
   * units count as they end; null between runs and during batch runs.
   */
  running: { requests: readonly IsolatedRequest[]; plan: IsolatedPlan } | null

  /**
   * Counts of the decided mutants by final status, kept with `statuses`.
   */
  counts: { survived: number; timeout: number; killed: number; error: number }

  /**
   * Evidence of the mutants of the running isolated run after its finished
   * units, by id; dropped once the run's result is recorded.
   */
  preview: Map<string, Pick<MutantState, 'evidence' | 'survived'>>

  /**
   * Final status counted for each decided mutant, by id.
   */
  statuses: Map<string, RunStatus>

  /**
   * Ids of the mutants the test runner evaluated outside its test workers in
   * the dry run: one no test kills or times out with ends with `Error`
   * (`markOutsideMutants`), so it counts as one.
   */
  outside: ReadonlySet<string>

  /**
   * Counts last reported, as a key, or null before the first report.
   */
  reported: string | null
}
