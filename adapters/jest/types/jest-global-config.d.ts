/**
 * What mootant reads of the global configuration `--showConfig` prints; the
 * rest travels with it.
 */
export interface JestGlobalConfig {
  /**
   * Absolute path of the global teardown of a configuration with `projects`,
   * which the projects do not hold, when set.
   */
  globalTeardown?: string | null

  /**
   * Branch or commit that limits the tests to those changed since; Jest ignores
   * null and an empty string.
   */
  changedSince?: string | null

  /**
   * Absolute path of the global setup of a configuration with `projects`, which
   * the projects do not hold, when set.
   */
  globalSetup?: string | null

  /**
   * Whether Jest looks for open handles, which makes it run test files one at a
   * time.
   */
  detectOpenHandles: boolean

  /**
   * Absolute path of the test sequencer.
   */
  testSequencer: string

  /**
   * Most test files at once, as Jest resolved its settings.
   */
  maxWorkers: number

  /**
   * Whether tests print with a console of their own as they run, when set.
   */
  verbose?: boolean

  /**
   * Whether what tests print is dropped, when set.
   */
  silent?: boolean
}
