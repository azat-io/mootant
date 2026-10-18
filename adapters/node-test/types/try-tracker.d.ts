import type { NodeTestEnd } from './node-test-record'
import type { TryContext } from './try-context'

/**
 * Tries of a test process: when they start and end, what they evaluate, and the
 * end of the process.
 */
export interface TryTracker {
  /**
   * Ends the process's records: records the tries not recorded yet and the end
   * record with the inputs the process read.
   */
  exit(
    code: number,
    inputs: Pick<
      NodeTestEnd,
      'environment' | 'required' | 'modified' | 'files'
    >,
  ): void

  /**
   * Starts a try for a test the root `beforeEach` sees, unless the test is a
   * subtest of a running try.
   *
   * @throws Error - `MootantBailError` when the unit stops starting tests.
   */
  open(context: TryContext): void

  /**
   * Records an uncaught exception or unhandled rejection.
   */
  error(error: unknown): void

  /**
   * Takes the error of a todo test that mootant's reporter passed: the try
   * whose test failed with it never fails, nor does the uncaught error that is
   * its cause.
   */
  todo(error: unknown): void

  /**
   * Records that the test file finished evaluating.
   */
  loaded(): void
}
