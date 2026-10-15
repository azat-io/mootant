import type { IsolatedReason } from './isolated-reason'

/**
 * Route of one pending mutant decided from the dry run.
 */
export interface MutantClass {
  /**
   * `batch` or `isolated`, or null when no test reached it.
   */
  path: 'isolated' | 'batch' | null

  /**
   * Why it takes the isolated path, or null when it does not, and outside fast
   * mode for every covered mutant that is not static.
   */
  reason: IsolatedReason | null

  /**
   * Ids of the tests that reached it, cheapest first: tests whose tries all
   * reached it on the batch path, tests that reached it at all on the isolated
   * path.
   */
  coveredBy: string[]

  /**
   * Whether a test file reached it while loading.
   */
  static: boolean
}
