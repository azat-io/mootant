import type { DryAnalysis } from '../../types/run/dry-analysis'

import { compareCodeUnits } from '../compare-code-units'
import { getTestFileKey } from './get-test-file-key'

/**
 * Orders the covering tests of a mutant for a report: by their test file in the
 * order of the ranked files (`rankMutantFiles`), the likeliest to kill it
 * first, then by line, a test without a line last, then by name and id. The
 * order depends only on the files, imports and coverage of the dry run, never
 * on durations, so the same project gets the same order on every run.
 *
 * @param tests - Ids of the covering tests.
 * @param ranked - Keys of the test files of the mutant in rank order, the file
 *   of every covering test among them.
 * @param analysis - Dry run analysis with the tests.
 * @returns New sorted array.
 */
export function orderCoveringTests(
  tests: readonly string[],
  ranked: readonly string[],
  analysis: DryAnalysis,
): string[] {
  let ranks = new Map(ranked.map((key, index) => [key, index]))
  let entries = tests.map(id => {
    let test = analysis.tests.get(id)!
    return {
      rank: ranks.get(getTestFileKey(test))!,
      line: test.line ?? Infinity,
      name: test.name,
      id,
    }
  })
  return entries
    .toSorted(
      (left, right) =>
        left.rank - right.rank ||
        left.line - right.line ||
        compareCodeUnits(left.name, right.name) ||
        compareCodeUnits(left.id, right.id),
    )
    .map(entry => entry.id)
}
