/**
 * Milliseconds of the phases of a run.
 */
export interface RunDurations {
  /**
   * Batch phases with their recovery and confirmation runs, or null outside
   * fast mode.
   */
  batch: number | null

  /**
   * Isolated runs, retries and confirmations included, and saving the cache and
   * the dry run for later runs.
   */
  isolated: number

  /**
   * Loading the configuration, listing mutants, checking the dry run of an
   * earlier run and hashing the project, and starting the test runner when that
   * dry run is not reused.
   */
  startup: number

  /**
   * Dry runs, the uninstrumented check of failing tests included, and preparing
   * the cache; only the latter when the run reuses the dry run of an earlier
   * run.
   */
  dryRun: number

  /**
   * The whole run.
   */
  total: number
}
