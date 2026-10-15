/**
 * Tells whether a thrown value is the error of the hit limit. The check is by
 * name, so an error created in another realm, or copied by a test runner,
 * matches too.
 *
 * @param error - Thrown value.
 * @returns Whether the value is an object named `MootantHitLimitError`.
 */
export function isHitLimitError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, 'name') === 'MootantHitLimitError'
  )
}
