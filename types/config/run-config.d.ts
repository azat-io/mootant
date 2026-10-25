import type { TestAdapter } from '../adapter/test-adapter'

/**
 * Settings of `mootant run` in the configuration file. Command line options
 * win.
 */
export interface RunConfig {
  /**
   * Per-try timeout: `ceil(factor × dry duration) + constant` milliseconds.
   * Defaults: factor 3, constant 250.
   */
  timeout?: { constant?: number; factor?: number }

  /**
   * Hit limit per try: `max(floor, factor × dry hits)`. Defaults: factor 100,
   * floor 100000.
   */
  hitLimit?: { factor?: number; floor?: number }

  /**
   * Test runner: a built-in name (`vitest` or `node-test`, no options), or an
   * adapter object that the configuration file imports, such as
   * `vitestAdapter({ config: 'vitest.unit.config.ts' })` or `nodeTestAdapter({
   * command: 'bnt' })`. Detected when omitted.
   */
  runner?: TestAdapter | string

  /**
   * Incremental mode: reuse a cached verdict while the declaration of its
   * mutant, what that uses in its file and what its test file reads outside the
   * mutated files stay the same, even after changes elsewhere, which may leave
   * it stale; false when omitted, so any change of a file its tests load runs
   * the mutant again.
   */
  incremental?: boolean

  /**
   * Most test files at once; the runner's own setting when omitted.
   */
  concurrency?: number

  /**
   * Lowest total score that passes, 0 to 100; none when omitted.
   */
  threshold?: number

  /**
   * Paths to mutate when the command line gives none, relative to the directory
   * of the configuration file.
   */
  paths?: string[]

  /**
   * Reuse verdicts of earlier runs whose code, tests and settings are
   * unchanged; true when omitted.
   */
  cache?: boolean

  /**
   * Fast mode: try runtime mutants in batch runs first and accept their kills,
   * which may be false; false when omitted, so every covered mutant is decided
   * on a fresh module graph.
   */
  fast?: boolean
}
