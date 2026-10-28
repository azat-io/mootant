import type { StatusCounts } from '../../types/run/status-counts'
import type { RunScore } from '../../types/run/run-score'

/**
 * Computes the mutation scores: detected (`Killed` and `Timeout`) over detected
 * plus `Survived`, and over those plus `NoCoverage` for the total. `Ignored`
 * and `Error` are never scored.
 *
 * @param counts - Mutants by final status, as `countStatuses` returns them.
 * @returns Scores in percent with two decimals, null without a denominator.
 */
export function computeScore(counts: StatusCounts): RunScore {
  let detected = counts.Killed + counts.Timeout
  let covered = detected + counts.Survived
  return {
    total: getPercent(detected, covered + counts.NoCoverage),
    covered: getPercent(detected, covered),
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
