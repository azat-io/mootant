/**
 * Error that stops a try whose code evaluated more mutant sites than allowed.
 */
class MootantHitLimitError extends Error {
  /**
   * Name that tells the error apart, even across realms.
   */
  public override name = 'MootantHitLimitError'
}

/**
 * Creates the error that stops a batch try, or a test file run with a mutant,
 * whose code evaluated more mutant sites than allowed: a loop that a mutant
 * made endless, or code that a mutant made far hotter, such as a cache turned
 * off.
 *
 * @param id - Id of the mutant whose site went over the limit.
 * @param limit - Site evaluations allowed.
 * @returns Error named `MootantHitLimitError`.
 */
export function createHitLimitError(id: string, limit: number): Error {
  return new MootantHitLimitError(
    `mootant stopped the test after ${limit} evaluations of mutant sites, at mutant ${id}; the code may loop endlessly or do far more work than without mutants (see run.hitLimit).`,
  )
}
