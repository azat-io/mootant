/**
 * What mootant reads of the result Jest gives for a test file.
 */
export interface JestFileResult {
  /**
   * Result of each test.
   */
  testResults: {
    /**
     * Place of the test in its file, when Jest knows it.
     */
    location?: { line: number } | null

    /**
     * Names of the blocks around the test, the outermost first.
     */
    ancestorTitles: string[]

    /**
     * Name of the test.
     */
    title: string
  }[]

  /**
   * Snapshots of the file, which fail a run of Jest with every test passing
   * when an entry went unchecked, when a test caught a failed match, or when
   * the snapshot file holds no entry, which Jest takes as one to delete.
   */
  snapshot: { fileDeleted: boolean; unchecked: number; unmatched: number }

  /**
   * An error outside any test; its `message` is empty on Jest 29 and 30.
   */
  testExecError?: { stack: string }

  /**
   * Jest's text of what failed.
   */
  failureMessage?: string | null

  /**
   * Entries of a console that kept what tests printed, for Jest's
   * `getConsoleOutput`; missing when the console kept nothing.
   */
  console?: object[]
}
