/**
 * Mutation scores in percent with two decimals, or null without mutants to
 * score.
 */
export interface RunScore {
  /**
   * (Killed + Timeout) / (Killed + Timeout + Survived) * 100.
   */
  covered: number | null

  /**
   * (Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage) * 100.
   */
  total: number | null
}
