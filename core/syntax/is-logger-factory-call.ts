import type { CallExpression } from 'oxc-parser'

import { unwrapExpression } from '../tree/unwrap-expression'
import { getMemberPath } from './get-member-path'
import { isLoggerName } from './is-logger-name'

/**
 * Methods of a logger receiver that create a child logger with a label.
 */
let factoryMethods = new Set(['withContext', 'getLogger', 'withTag', 'child'])

/**
 * Tells whether a call creates a child logger: a `withContext`, `child`,
 * `getLogger` or `withTag` method of a receiver that the `loggers` setting
 * names (see `isLoggerName`), or of another child logger, such as
 * `logger.withContext('Build')` and `logger.withContext('A').withContext('B')`.
 * Reads only the callee.
 *
 * @param node - Call to check.
 * @param loggers - Names of the `loggers` setting.
 * @returns Whether the call creates a child logger.
 */
export function isLoggerFactoryCall(
  node: CallExpression,
  loggers: readonly string[],
): boolean {
  let path = getMemberPath(node.callee)
  if (path !== null) {
    let receiver = path.at(-2)
    return (
      receiver !== undefined &&
      factoryMethods.has(path.at(-1)!) &&
      isLoggerName(receiver, loggers)
    )
  }

  let callee = unwrapExpression(node.callee)
  if (callee.type === 'ChainExpression') {
    callee = unwrapExpression(callee.expression)
  }
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    !factoryMethods.has(callee.property.name)
  ) {
    return false
  }
  let receiver = unwrapExpression(callee.object)
  return (
    receiver.type === 'CallExpression' && isLoggerFactoryCall(receiver, loggers)
  )
}
