import type { HtmlReportTest } from '../../../types/report/html-report'
import type { TestsFilter } from '../../../types/html/tests-filter'

/**
 * Number of the slowest tests.
 */
const SLOWEST = 20

/**
 * Groups the tests of the dry run for the tests page: every test and the ones
 * that reach survivors, by survivors and then by mutants reached; the ones that
 * reach no mutant; and the slowest, by time.
 *
 * @param tests - Tests of the dry run.
 * @returns Tests of each group in the order to show.
 */
export function getTestGroups(
  tests: readonly HtmlReportTest[],
): Record<TestsFilter['group'], HtmlReportTest[]> {
  return {
    slowest: tests
      .toSorted((first, second) => second.duration - first.duration)
      .slice(0, SLOWEST),
    survivors: tests.filter(test => test.survivors > 0).toSorted(compareReach),
    none: tests.filter(test => test.reach === 0),
    all: tests.toSorted(compareReach),
  }
}

/**
 * Orders tests by the survivors they reach, then by the mutants they reach.
 *
 * @param first - One test.
 * @param second - The other test.
 * @returns Negative when the first comes first.
 */
function compareReach(first: HtmlReportTest, second: HtmlReportTest): number {
  return second.survivors - first.survivors || second.reach - first.reach
}
