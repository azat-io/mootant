import type { IsolatedReason } from './isolated-reason'
import type { Mutant } from '../mutant/mutant'
import type { RunStatus } from './run-status'
import type { TryCause } from './try-cause'

/**
 * Verdict of one mutant.
 */
export interface MutantResult {
  /**
   * Why it ran isolated: in fast mode, or `static` in any mode; null when it
   * did not run isolated, and outside fast mode for every non-static mutant.
   */
  isolatedBecause: IsolatedReason | null

  /**
   * How the verdict was reached, or null when nothing ran: `isolated` on a
   * fresh module graph, `batch` in a batch try of fast mode, whose kill may be
   * false (see `RunMode`).
   */
  path: 'isolated' | 'batch' | null

  /**
   * Id of the test that killed it or timed out, or null (load-time kills).
   */
  killedBy: string | null

  /**
   * Absolute path of the test file of the verdict, or null.
   */
  killedIn: string | null

  /**
   * First line of the failure, or of the reason of `Error`, or null.
   */
  message: string | null

  /**
   * How it was detected, or null when it was not.
   */
  cause: TryCause | null

  /**
   * Ids of tests that reached it, cheapest first; empty for `NoCoverage`,
   * `Ignored` and mutants reached only at load.
   */
  coveredBy: string[]

  /**
   * Final state.
   */
  status: RunStatus

  /**
   * Milliseconds of its tries and units (a unit's whole file time).
   */
  duration: number

  /**
   * The mutant as listed.
   */
  mutant: Mutant

  /**
   * Tries and units that ran it.
   */
  tries: number
}
