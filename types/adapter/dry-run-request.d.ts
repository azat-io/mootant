/**
 * Which tests a dry run executes and how.
 */
export interface DryRunRequest {
  /**
   * Test files to run, each whole, by path and project (an empty string without
   * one); null runs every test file related to `related`.
   */
  files: { project: string; file: string }[] | null

  /**
   * Milliseconds a try may take, its hooks included, on top of the test's own
   * timeout (`test`), and milliseconds the work of a test file outside tries
   * may take, such as loading it and its suite hooks (`file`). Past them the
   * adapter stops the worker and reports it in `DryRunResult.hung`: a test
   * runner's own timeouts do not stop a synchronous loop.
   */
  timeouts: { test: number; file: number }

  /**
   * False serves every file as is (used to tell instrumentation breakage from
   * real failures); the adapter drops cached transforms first.
   */
  instrumented: boolean

  /**
   * Absolute paths of mutated files: only test files that import them run.
   */
  related: string[]

  /**
   * True tries every test twice in a row; false runs each test once, as a plain
   * run of the test runner does, so state one try leaves for the next cannot
   * fail a later test or a suite hook.
   */
  repeat: boolean
}
