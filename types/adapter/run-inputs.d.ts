/**
 * What a run of a test file read besides the code of its mutant: the files it
 * depended on and the environment variables it read. The cache compares them
 * with the dry run of the test file, and evidence that read more is reused only
 * while those extra inputs are unchanged.
 */
export interface RunInputs {
  /**
   * Absolute paths of the files the run depended on, in the form of
   * `DryFile.dependencies`, such as a module only a mutant loads or a file the
   * test code read.
   */
  dependencies: string[]

  /**
   * Names of the environment variables the test code read, or `*` when it
   * listed them all; values come from `CacheInputs.environment`.
   */
  environment: string[]
}
