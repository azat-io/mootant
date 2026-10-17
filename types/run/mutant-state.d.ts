import type { IsolatedReason } from './isolated-reason'
import type { Mutant } from '../mutant/mutant'
import type { TryCause } from './try-cause'

/**
 * Route and evidence of one pending mutant during a run.
 */
export interface MutantState {
  /**
   * Batch tries that ran out of time with it and wait for a confirmation with
   * doubled bounds.
   */
  confirm: { cause: 'time-limit' | 'hang'; test: string }[]

  /**
   * Why it takes the isolated path, or null when it does not, and outside fast
   * mode for every covered mutant that is not static.
   */
  isolatedBecause: IsolatedReason | null

  /**
   * Path it takes, or null when nothing runs it.
   */
  path: 'isolated' | 'batch' | null

  /**
   * Kill, confirmed timeout or error, or null while undecided.
   */
  verdict: MutantVerdict | null

  /**
   * Milliseconds of its isolated units.
   */
  unitDuration: number

  /**
   * Ids of the tests that reached it in the dry run, cheapest first.
   */
  coveredBy: string[]

  /**
   * Whether a try passed after reaching it. On the batch path this only picks
   * the reason of the isolated recheck; it is cleared when the mutant goes
   * isolated, where a reached pass of a unit is `Survived` evidence.
   */
  survived: boolean

  /**
   * Milliseconds of its tries and units.
   */
  duration: number

  /**
   * Keys of the test files not run yet on the isolated path (`getTestFileKey`),
   * cheapest first.
   */
  files: string[]

  /**
   * Ids of the covering tests not tried yet on the batch path, cheapest first.
   */
  queue: string[]

  /**
   * Whether its verdict came from the cache, so nothing ran it.
   */
  cached: boolean

  /**
   * Whether a test file reached it while loading.
   */
  static: boolean

  /**
   * The mutant as listed.
   */
  mutant: Mutant

  /**
   * Tries and units that ran it.
   */
  tries: number

  /**
   * Isolated units that ran it.
   */
  units: number
}

/**
 * Final evidence about a mutant: a kill, a confirmed timeout, or no verdict.
 */
export interface MutantVerdict {
  /**
   * Status the evidence decides.
   */
  status: 'Timeout' | 'Killed' | 'Error'

  /**
   * First line of the failure or of the reason of `Error`, or null.
   */
  message: string | null

  /**
   * How it was detected, or null for `Error`.
   */
  cause: TryCause | null

  /**
   * Id of the test of the evidence, or null (load-time kills, `Error`).
   */
  test: string | null

  /**
   * Absolute path of the test file of the evidence, or null.
   */
  file: string | null
}
