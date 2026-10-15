/**
 * Pattern of the errors of Vitest's own test and hook timeouts, those of
 * `aroundEach` and `aroundAll` included.
 */
const TIMEOUT_PATTERN =
  /^(?:(?:Hook|Test) timed out in |The (?:setup|teardown) phase of "around(?:All|Each)" hook timed out after )/u

/**
 * Tells whether an error message is one of Vitest's test or hook timeouts.
 *
 * @param message - Error message.
 * @returns Whether a test or hook ran out of time.
 */
export function isTimeoutMessage(message: string): boolean {
  return TIMEOUT_PATTERN.test(message)
}
