import type { MutantResult } from '../../types/run/mutant-result'

import { describeMutant } from './describe-mutant'

/**
 * Finds the verdict of the mutant with the given description.
 *
 * @param results - Verdicts of a run.
 * @param mutant - Description by `describeMutant`.
 * @returns Its verdict.
 */
export function findResult(
  results: MutantResult[],
  mutant: string,
): MutantResult | undefined {
  return results.find(result => describeMutant(result) === mutant)
}
