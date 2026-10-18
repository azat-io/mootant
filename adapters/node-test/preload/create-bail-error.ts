/**
 * Error that skips a test once an earlier test of the unit failed after the
 * mutant was reached.
 */
class MootantBailError extends Error {
  /**
   * Name that tells the error apart.
   */
  public override name = 'MootantBailError'
}

/**
 * Creates the error the root `beforeEach` throws to skip a test once an earlier
 * test failed after the mutant was reached, which kills the mutant whatever
 * runs next. Node:test then skips the test's body, and still runs its
 * `afterEach` hooks and those of its suites..
 *
 * @returns Error named `MootantBailError`.
 */
export function createBailError(): Error {
  return new MootantBailError(
    'mootant skipped the test, since an earlier test already failed with the mutant active.',
  )
}
