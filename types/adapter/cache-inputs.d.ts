/**
 * What every verdict of a session depends on beyond the files each test file
 * loads (see `DryFile.dependencies`).
 */
export interface CacheInputs {
  /**
   * Hashes of the values of the environment variables test files see, by name,
   * for each project of the test runner by name (see `DryFile.project`), and
   * under `*` a hash of all of them but those that change from one shell to
   * another; a variable that is not set has no entry. Without it, variables
   * test files read count as not set.
   */
  environment?: Record<string, Record<string, string>>

  /**
   * Resolved settings that change verdicts, as plain JSON, such as the pool,
   * test isolation and the test environment of each project; never
   * concurrency.
   */
  settings: unknown

  /**
   * Absolute paths of the files the test runner reads itself, such as its
   * configuration file and the files that imports, the `.env` files it loads,
   * global setup files and custom test environments. Missing files count too:
   * creating one changes the key.
   */
  files: string[]
}
