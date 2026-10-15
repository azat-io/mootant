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
 * Creates the error that stops a try whose code evaluated more mutant sites
 * than its hit limit allows, such as a loop that a mutant made endless.
 *
 * @param id - Id of the mutant whose site went over the limit.
 * @param limit - Site evaluations the try was allowed.
 * @returns Error named `MootantHitLimitError`.
 */
export function createHitLimitError(id: string, limit: number): Error {
  return new MootantHitLimitError(
    `mootant stopped the test after ${limit} evaluations of mutant sites, at mutant ${id}; the code is likely stuck in a loop.`,
  )
}
