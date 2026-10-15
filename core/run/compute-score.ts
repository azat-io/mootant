import type { MutantResult } from '../../types/run/mutant-result'
import type { RunScore } from '../../types/run/run-score'

/**
 * Computes the mutation scores: detected (`Killed` and `Timeout`) over detected
 * plus `Survived`, and over those plus `NoCoverage` for the total. `Ignored`
 * and `Error` are never scored.
 *
 * @param results - Verdicts of the run.
 * @returns Scores in percent with two decimals, null without a denominator.
 */
export function computeScore(results: readonly MutantResult[]): RunScore {
  let detected = 0
  let survived = 0
  let uncovered = 0
  for (let { status } of results) {
    switch (status) {
      case 'NoCoverage': {
        uncovered += 1

        break
      }
      case 'Survived': {
        survived += 1

        break
      }
      case 'Timeout':
      case 'Killed': {
        detected += 1

        break
      }
      // No default
    }
  }
  return {
    total: getPercent(detected, detected + survived + uncovered),
    covered: getPercent(detected, detected + survived),
  }
}

/**
 * Computes a percentage rounded to two decimals.
 *
 * @param part - Numerator.
 * @param whole - Denominator.
 * @returns The percentage, or null when the denominator is 0.
 */
function getPercent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 10_000) / 100
}
