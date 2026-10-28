import type { LimitSettings } from '../run/run-state'

/**
 * Settings of a run, with the command line over the configuration and the
 * defaults filled in (`resolveRunSettings`).
 */
export interface RunSettings {
  /**
   * Most test files at once, or null for the runner's own setting.
   */
  concurrency: number | null

  /**
   * Lowest total score that passes, or null.
   */
  threshold: number | null

  /**
   * How try limits grow from the dry run.
   */
  limits: LimitSettings

  /**
   * Whether incremental mode is on, so a cached verdict is also reused while
   * its mutant keeps its region.
   */
  incremental: boolean

  /**
   * Whether verdicts of earlier runs are reused and new ones saved.
   */
  cache: boolean

  /**
   * Whether fast mode was asked for, which the run uses only with an adapter
   * that has batch mode.
   */
  fast: boolean
}
