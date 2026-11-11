/**
 * What mootant reads of a project configuration `--showConfig` prints, with
 * paths absolute; the rest travels with it.
 */
export interface JestProjectConfig {
  /**
   * Transformers as `[pattern, absolute path, options]`.
   */
  transform: [string, string, unknown][]

  /**
   * Absolute path of the module that extracts dependencies, when set.
   */
  dependencyExtractor?: string | null

  /**
   * Patterns of the files Jest does not transform.
   */
  transformIgnorePatterns: string[]

  /**
   * Absolute path of the snapshot resolver, when set.
   */
  snapshotResolver?: string | null

  /**
   * Display name of the project, when it has one.
   */
  displayName?: { name: string }

  /**
   * Absolute path of the global teardown, when set.
   */
  globalTeardown?: string | null

  /**
   * Extensions, without the dot, of the files Jest loads as modules.
   */
  moduleFileExtensions: string[]

  /**
   * Absolute paths of the snapshot serializers.
   */
  snapshotSerializers: string[]

  /**
   * Absolute paths of the modules that run after the framework is installed.
   */
  setupFilesAfterEnv: string[]

  /**
   * Absolute path of the global setup, when set.
   */
  globalSetup?: string | null

  /**
   * Absolute path of the resolver, when set.
   */
  resolver?: string | null

  /**
   * Absolute path of the test environment.
   */
  testEnvironment: string

  /**
   * Absolute path of the module that loads the modules of tests, when set.
   */
  runtime?: string | null

  /**
   * Absolute paths of the modules that run before the framework is installed.
   */
  setupFiles: string[]

  /**
   * Absolute path of the test framework.
   */
  testRunner: string

  /**
   * Whether tests print with a console of their own as they run, which Jest 30
   * reads before the global setting; never set on Jest 29.
   */
  verbose?: boolean

  /**
   * Whether what tests print is dropped, which Jest 30 reads before the global
   * setting; never set on Jest 29.
   */
  silent?: boolean

  /**
   * Absolute directory of the project.
   */
  rootDir: string

  /**
   * Absolute directories Jest looks for test files and modules in.
   */
  roots: string[]

  /**
   * Absolute path of the runner of test files.
   */
  runner: string

  /**
   * Hash Jest gives the project, which holds absolute paths.
   */
  id: string
}
