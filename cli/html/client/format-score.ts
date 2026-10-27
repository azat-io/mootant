/**
 * Formats a score as the report shows it: two decimals, and `100%` without
 * them.
 *
 * @param score - Score in percent, or null.
 * @returns Text such as `94.11%`, `100%` or `–` without a score.
 */
export function formatScore(score: number | null): string {
  if (score === null) {
    return '–'
  }
  return score === 100 ? '100%' : `${score.toFixed(2)}%`
}
