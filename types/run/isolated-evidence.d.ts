import type { MutantVerdict } from './mutant-state'

/**
 * Evidence of one isolated test file of a mutant: a kill, a timeout or an
 * error, `none` for a file done without one (it passed or did not reach the
 * mutant), `confirming` while a timeout waits for its confirmation, or
 * `retrying` while a unit the test runner did not report waits for its retry.
 */
export type IsolatedEvidence =
  MutantVerdict | 'confirming' | 'retrying' | 'none'
