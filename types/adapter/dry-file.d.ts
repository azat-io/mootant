/**
 * One test file as a dry run saw it.
 */
export interface DryFile {
  /**
   * Milliseconds from the start of loading to the end of collection.
   */
  loadDuration: number

  /**
   * Milliseconds the file spent outside tries after it loaded, such as in
   * `beforeAll` and `afterAll` hooks of its suites and in the worker's
   * teardown.
   */
  hookDuration: number

  /**
   * Whether the file failed to load, a suite hook of it failed, or the worker's
   * teardown failed after it.
   */
  loadFailed: boolean

  /**
   * Whether a suite or test of the file is marked to run concurrently. A dry
   * run that tries each test twice ran them one at a time, as batch runs do.
   */
  concurrent: boolean

  /**
   * Ids of mutants whose sites ran outside any try: while the file and its
   * imports loaded, in setup files, `beforeAll`, `afterAll`. Sorted.
   */
  covers: string[]

  /**
   * The collection error, the first failed suite hook or worker teardown and
   * unhandled errors outside tries, as messages.
   */
  errors: string[]

  /**
   * Name of the test runner's project the file ran in, or an empty string. A
   * test file that several projects include is a separate test file in each.
   */
  project: string

  /**
   * Site evaluations outside any try.
   */
  hits: number

  /**
   * Absolute path of the test file.
   */
  file: string
}
