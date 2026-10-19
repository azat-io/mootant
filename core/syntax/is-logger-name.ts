/**
 * Tells whether a name is a logger of the `loggers` setting: an entry equal to
 * the name in any letter case, so `logger` matches `Logger` and `LOGGER`, or an
 * entry `*Suffix` whose suffix, as written, ends the name, so `*Logger` matches
 * `requestLogger` but not `blogger`.
 *
 * @param name - Name of the receiver or of a bare function.
 * @param loggers - Names of the `loggers` setting.
 * @returns Whether the name is a logger.
 */
export function isLoggerName(
  name: string,
  loggers: readonly string[],
): boolean {
  let lower = name.toLowerCase()
  return loggers.some(entry => {
    let exact = entry.startsWith('*') ? entry.slice(1) : entry
    return (
      exact.toLowerCase() === lower || (exact !== entry && name.endsWith(exact))
    )
  })
}
