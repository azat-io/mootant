import type { StatusCounts } from '../../../types/html/status-counts'

/**
 * Computes the total score of counted mutants the way the run does: killed and
 * timed-out mutants over every scored one, without ignored mutants and errors,
 * rounded to two decimals.
 *
 * @param counts - Mutants by status.
 * @returns Score in percent, or null without mutants to score.
 */
export function getScore(counts: StatusCounts): number | null {
  let detected = counts.Killed + counts.Timeout
  let scored = detected + counts.Survived + counts.NoCoverage
  return scored === 0 ? null : Math.round((detected / scored) * 10_000) / 100
}
