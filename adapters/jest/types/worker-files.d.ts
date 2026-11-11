/**
 * Files mootant writes for the Jest processes of a run.
 */
export interface WorkerFiles {
  /**
   * Absolute real directory of the files.
   */
  directory: string

  /**
   * Results processor of the host: Jest calls it once global teardown ended,
   * and it leaves `RESULTS_MARK` beside itself, so a host that failed after it
   * failed for another reason than its teardown.
   */
  results: string

  /**
   * Absolute path of the host's `--runner`.
   */
  runner: string

  /**
   * Absolute path of the entry of a worker process.
   */
  worker: string

  /**
   * Absolute path of the module that serves as reporter and results processor.
   */
  noop: string
}
