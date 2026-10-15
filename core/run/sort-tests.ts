import type { DryAnalysis } from '../../types/run/dry-analysis'

import { compareCodeUnits } from '../compare-code-units'

/**
 * Sorts test ids cheapest first: by the slower duration of their dry tries,
 * then by id.
 *
 * @param tests - Ids of tests of the dry run.
 * @param analysis - Dry run analysis with the bounds of the tests.
 * @returns New sorted array.
 */
export function sortTests(
  tests: Iterable<string>,
  analysis: DryAnalysis,
): string[] {
  return [...tests].toSorted(
    (left, right) =>
      analysis.baselines.get(left)!.duration -
        analysis.baselines.get(right)!.duration ||
      compareCodeUnits(left, right),
  )
}
