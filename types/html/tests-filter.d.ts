/**
 * What the page of the tests shows.
 */
export interface TestsFilter {
  /**
   * Group of tests to show.
   */
  group: 'survivors' | 'slowest' | 'none' | 'all'

  /**
   * Index of the test that the search opened, marked and always among the rows,
   * or null.
   */
  target: number | null

  /**
   * Most rows to show, besides the target.
   */
  limit: number
}
