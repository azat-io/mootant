import type { ErrorRealm } from './error-realm'

/**
 * A test with all its attempts, which is what a try means to the core.
 */
export interface FoldedTest {
  /**
   * Where the failure of the last attempt comes from, or null when it passed.
   */
  realm: ErrorRealm | null

  /**
   * First line of the failure of the last attempt, or null when it passed.
   */
  message: string | null

  /**
   * Earlier tests of the file with the same full name.
   */
  occurrence: number

  /**
   * Whether the last attempt ran past its timeout.
   */
  timedOut: boolean

  /**
   * Ids of the sites any attempt evaluated, sorted.
   */
  covers: string[]

  /**
   * Milliseconds of all attempts.
   */
  duration: number

  /**
   * Whether the active mutant was reached by the end of the last attempt.
   */
  reached: boolean

  /**
   * Whether the last attempt failed.
   */
  failed: boolean

  /**
   * Full name of the test with its blocks, joined by `>`.
   */
  name: string

  /**
   * Site evaluations of all attempts.
   */
  hits: number
}
