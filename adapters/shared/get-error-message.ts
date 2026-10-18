/**
 * Longest message kept, in code units.
 */
const MESSAGE_LIMIT = 200

/**
 * Shortens an error to a message for facts and reports. Errors a test runner
 * serialized may have no prototype, so they are read by their fields.
 *
 * @param error - Thrown value or error serialized by the test runner.
 * @returns First line of the message, or the name of an error without one, at
 *   most 200 code units.
 */
export function getErrorMessage(error: unknown): string {
  let text = 'Error'
  if (typeof error !== 'object' || error === null) {
    text = String(error)
  } else {
    let message: unknown = Reflect.get(error, 'message')
    let name: unknown = Reflect.get(error, 'name')
    if (typeof message === 'string' && message !== '') {
      text = message
    } else if (typeof name === 'string' && name !== '') {
      text = name
    }
  }
  return text.split('\n', 1)[0]!.slice(0, MESSAGE_LIMIT)
}
