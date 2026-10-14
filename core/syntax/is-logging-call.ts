import type { CallExpression } from 'oxc-parser'

import { unwrapParentheses } from '../tree/unwrap-parentheses'
import { getMemberPath } from './get-member-path'

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
 * Bare functions that are logging calls when their first argument is a text.
 */
let bareLogFunctions = new Set(['debug', 'log'])

/**
 * Receivers named `log` or `logger`, in any letter case.
 */
const LOGGER_NAME_PATTERN = /^log(?:ger)?$/iu

/**
 * Tells whether a call writes a log entry: a `console` method, a log method of
 * a receiver named `log`, `logger` or `...Logger`, or `log` and `debug` called
 * with a string or template literal first. Only the log output depends on the
 * callee and the arguments of such a call, so they are never mutated. Reads
 * only the callee and the first argument.
 *
 * @param node - Call to check.
 * @returns Whether the call is a logging call.
 */
export function isLoggingCall(node: CallExpression): boolean {
  let path = getMemberPath(node.callee)
  if (path === null) {
    return false
  }

  let [first] = path
  if (path.length === 1) {
    let [argument] = node.arguments
    if (!argument || !bareLogFunctions.has(first!)) {
      return false
    }
    let value = unwrapParentheses(argument)
    return (
      value.type === 'TemplateLiteral' ||
      (value.type === 'Literal' && typeof value.value === 'string')
    )
  }
  if (first === 'console' && path.length === 2) {
    return true
  }

  let receiver = path.at(-2)!
  return (
    logMethods.has(path.at(-1)!) &&
    (LOGGER_NAME_PATTERN.test(receiver) || receiver.endsWith('Logger'))
  )
}
