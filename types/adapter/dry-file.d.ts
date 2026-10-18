/**
 * One test file as a dry run saw it.
 */
export interface DryFile {
  /**
   * Absolute paths of the files the test file depended on in the run: the test
   * file, its setup files, every module the runner evaluated for it, files
   * plugins watch for them, files the test code read, a missing one or a
   * directory included, and its snapshot files, whether they exist or not. Null
   * or omitted when the adapter cannot tell; the cache then never reuses or
   * stores verdicts of this test file.
   */
  dependencies?: string[] | null

  /**
   * Names of the environment variables the test code read in the run, or `*`
   * when it listed them all; values come from `CacheInputs.environment`.
   * Omitted when the adapter does not track them.
   */
  environment?: string[]

  /**
   * Milliseconds from the start of loading to the end of collection.
   */
  loadDuration: number

  /**
   * Milliseconds the file spent outside tries after it loaded, such as in the
   * suite hooks (`beforeAll`/`before`, `afterAll`/`after`) and in the teardown
   * after the file.
   */
  hookDuration: number

  /**
   * Absolute paths of the dependencies the test code changed itself in the run,
   * such as a file it read and wrote back or a directory it listed and added a
   * file to. Their modification time says nothing about edits while the run
   * went on, so the cache compares their contents instead. Omitted when the
   * adapter does not track them.
   */
  modified?: string[]

  /**
   * Whether the file failed to load, a suite hook of it failed, the teardown
   * after it failed, or its plain run failed outside its tests.
   */
  loadFailed: boolean

  /**
   * Whether a suite or test of the file is marked to run concurrently. A dry
   * run that tries each test twice ran them one at a time, as batch runs do.
   */
  concurrent: boolean

  /**
   * Ids of mutants whose sites ran outside any try: while the file and its
   * imports loaded, in setup files, in suite hooks (`beforeAll`/`before`,
   * `afterAll`/`after`). Sorted.
   */
  covers: string[]

  /**
   * The collection error, the first failed suite hook or file teardown and
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
