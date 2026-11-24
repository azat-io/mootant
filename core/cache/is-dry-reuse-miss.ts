/**
 * Tells whether a thrown value is the error that ends a replay of a saved dry
 * run (`createDryReuseMiss`).
 *
 * @param error - Thrown value.
 * @returns Whether the value is an object named `DryReuseMiss`.
 */
export function isDryReuseMiss(error: unknown): error is Error {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, 'name') === 'DryReuseMiss'
  )
}
