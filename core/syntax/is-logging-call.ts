import type { CallExpression } from 'oxc-parser'

import { unwrapParentheses } from '../tree/unwrap-parentheses'
import { getMemberPath } from './get-member-path'
import { isConsolePath } from './is-console-path'
import { isLoggerName } from './is-logger-name'

/**
 * Methods of a logger receiver that write a log entry.
 */
let logMethods = new Set([
  'critical',
  'verbose',
  'warning',
  'notice',
  'debug',
  'error',
  'fatal',
  'silly',
  'trace',
  'info',
  'warn',
  'log',
])

/**
 * Tells whether a call writes a log entry, by the names of the `loggers`
 * setting (see `isLoggerName`): any method of the global console when `console`
 * is a logger, also through a global object (`isConsolePath`), such as
 * `globalThis.console.table()`, a log method of another logger receiver, such
 * as `logger.info()`, or a bare logger function, such as `log()` or `debug()`,
 * called with a string or template literal first. A name the setting leaves out
 * is ordinary code. Reads only the callee and the first argument.
 *
 * @param node - Call to check.
 * @param loggers - Names of the `loggers` setting.
 * @returns Whether the call is a logging call.
 */
export function isLoggingCall(
  node: CallExpression,
  loggers: readonly string[],
): boolean {
  let path = getMemberPath(node.callee)
  if (path === null) {
    return false
  }

  let [first] = path
  if (path.length === 1) {
    let [argument] = node.arguments
    if (!argument || !isLoggerName(first!, loggers)) {
      return false
    }
    let value = unwrapParentheses(argument)
    return (
      value.type === 'TemplateLiteral' ||
      (value.type === 'Literal' && typeof value.value === 'string')
    )
  }
  if (isConsolePath(path)) {
    return isLoggerName('console', loggers)
  }

  return logMethods.has(path.at(-1)!) && isLoggerName(path.at(-2)!, loggers)
}
