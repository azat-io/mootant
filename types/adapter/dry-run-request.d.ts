/**
 * Which tests a dry run executes and how.
 */
export interface DryRunRequest {
  /**
   * Test files to run, each whole, by path and project (an empty string without
   * one); null runs the test files related to `related`, or more.
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
   * Absolute paths of mutated files, a hint of which test files to run when
   * `files` is null: those that may import them run. An adapter may run more,
   * such as every test file when it does not know yet what each one imports;
   * each test file it runs is reported as usual.
   */
  related: string[]

  /**
   * True tries every test twice in a row; false runs each test once, as a plain
   * run of the test runner does, so state one try leaves for the next cannot
   * fail a later test or a suite hook.
   */
  repeat: boolean
}
