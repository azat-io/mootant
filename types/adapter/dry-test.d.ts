import type { TryFacts } from './try-facts'

/**
 * One test of a dry run with its tries.
 */
export interface DryTest {
  /**
   * 1-based line of the test in its file, or null.
   */
  line: number | null

  /**
   * Both tries in order (one when the first skipped itself).
   */
  tries: TryFacts[]

  /**
   * Name of the test runner's project the test ran in, or an empty string.
   */
  project: string

  /**
   * Absolute path of the test file.
   */
  file: string

  /**
   * Full name with suites, joined by `>`.
   */
  name: string

  /**
   * Id of the test, stable across runs while the file is unchanged.
   */
  id: string
}
