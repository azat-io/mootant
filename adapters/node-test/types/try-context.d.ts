/**
 * Context of a running test that node:test passes to a root `beforeEach`, as
 * much of `TestContext` as mootant reads.
 */
export interface TryContext {
  /**
   * Registers a function to run after the test and all its `afterEach` hooks.
   */
  after(function_: () => void): void

  /**
   * Full name of the test with its suites, joined by `>`.
   */
  readonly fullName: string

  /**
   * Whether the test passed so far; final once the next try starts or the
   * process exits.
   */
  readonly passed: boolean

  /**
   * Error of the test once it failed, or null; read when the try is final.
   */
  readonly error: unknown
}
