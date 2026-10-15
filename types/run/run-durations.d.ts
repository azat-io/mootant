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
   * Isolated runs, retries and confirmations included.
   */
  isolated: number

  /**
   * Loading the configuration, listing mutants and starting the test runner.
   */
  startup: number

  /**
   * Dry runs, the uninstrumented check of failing tests included.
   */
  dryRun: number

  /**
   * The whole run.
   */
  total: number
}
