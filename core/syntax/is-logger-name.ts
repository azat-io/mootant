/**
 * Receivers named `log` or `logger`, in any letter case.
 */
const LOGGER_NAME_PATTERN = /^log(?:ger)?$/iu

/**
 * Tells whether a receiver name is a logger: `log` or `logger` in any letter
 * case, a name ending with `Logger`, or one of the names of the `loggers`
 * setting.
 *
 * @param name - Name of the receiver.
 * @param loggers - Exact names the `loggers` setting adds.
 * @returns Whether the name is a logger.
 */
export function isLoggerName(
  name: string,
  loggers: readonly string[],
): boolean {
  return (
    LOGGER_NAME_PATTERN.test(name) ||
    name.endsWith('Logger') ||
    loggers.includes(name)
  )
}
