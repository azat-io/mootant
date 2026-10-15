/**
 * Raw facts of one try, as the adapter observed them. The core classifies them
 * with `classifyTry`.
 */
export interface TryFacts {
  /**
   * Ids of the mutants whose sites the try evaluated, sorted; null when
   * coverage was not collected (batch and isolated tries).
   */
  covers: string[] | null

  /**
   * First line of the failure, at most 200 code units, or null.
   */
  message: string | null

  /**
   * Id of the active mutant, or null for a control try.
   */
  mutant: string | null

  /**
   * Whether the test or a hook did not finish in time (mootant's timer, the
   * runner's own test or hook timeout).
   */
  timedOut: boolean

  /**
   * Error messages that no test owned (unhandled errors and rejections) while
   * the try ran, first lines, at most 200 code units each.
   */
  strays: string[]

  /**
   * Whether the active mutant's site returned true at least once.
   */
  reached: boolean

  /**
   * Whether the try skipped itself (it ends the remaining tries of the test).
   */
  skipped: boolean

  /**
   * Milliseconds of the try, `beforeEach`/`afterEach` included.
   */
  duration: number

  /**
   * Whether the try failed, after the runner's "expected to fail" flip.
   */
  failed: boolean

  /**
   * Site evaluations during the try.
   */
  hits: number

  /**
   * Id of the test.
   */
  test: string
}
