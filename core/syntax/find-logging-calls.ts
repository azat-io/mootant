import type { CallExpression, Node } from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { LoggingCall } from '../../types/syntax/logging-call'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { unwrapExpression } from '../tree/unwrap-expression'
import { findMessageTexts } from './find-message-texts'
import { isPlainMessage } from './is-plain-message'
import { isLoggingCall } from './is-logging-call'
import { isFormatFree } from './is-format-free'

/**
 * Global objects whose `console` property a removable logging call may read.
 */
let consoleOwners = new Set(['globalThis', 'window'])

/**
 * Methods every console has, whose call a removable logging call may be.
 */
let consoleMethods = new Set([
  'groupCollapsed',
  'countReset',
  'profileEnd',
  'timeStamp',
  'groupEnd',
  'timeLog',
  'timeEnd',
  'profile',
  'assert',
  'dirxml',
  'count',
  'debug',
  'error',
  'group',
  'table',
  'trace',
  'clear',
  'info',
  'time',
  'warn',
  'dir',
  'log',
])

/**
 * Finds the logging calls of a program (see `isLoggingCall`), in tree order,
 * with the mutants that can only change the text they write: the literal text
 * of their arguments, and the statement of a call whose removal can only remove
 * that text. An argument followed by another one counts only when it surely
 * holds no format directive (see `isFormatFree`), since changing a directive,
 * such as `%j`, changes how the logger converts the arguments after it, which
 * may throw or run user code. A call is ordinary code when its root name is a
 * local `console`, which is not the global console, or is bound in the file to
 * a function, a class or an object literal, whose code may keep the text, as in
 * `function log(text) { messages.push(text) }`.
 *
 * @param tree - Runtime tree of the program.
 * @param scopes - Scope analysis of the program.
 * @param loggers - Names of the `loggers` setting.
 * @returns Logging calls of the program.
 */
export function findLoggingCalls(
  tree: TreeIndex,
  scopes: ScopeAnalysis,
  loggers: readonly string[],
): LoggingCall[] {
  let statements = new Map<Node, Node>()
  let calls: LoggingCall[] = []
  for (let node of tree.order) {
    if (node.type === 'ExpressionStatement') {
      statements.set(unwrapExpression(node.expression), node)
      continue
    }
    if (
      node.type !== 'CallExpression' ||
      !isLoggingCall(node, loggers) ||
      isLocalCode(node, scopes)
    ) {
      continue
    }
    let statement = statements.get(node)
    calls.push({
      statement:
        (
          statement === undefined ||
          !isConsoleCall(node, scopes) ||
          node.arguments.some(
            (argument, index, list) =>
              !isMessage(argument, index, list) || !isPlainMessage(argument),
          )
        ) ?
          null
        : { start: statement.start, end: statement.end },
      texts: node.arguments.flatMap((argument, index, list) =>
        isMessage(argument, index, list) ? findMessageTexts(argument) : [],
      ),
    })
  }
  return calls
}

/**
 * Tells whether the root name of the callee of a logging call is bound in the
 * file to code that is not a logger: a local `console`, or a function, class or
 * object literal, such as `let logger = { info(text) { lines.push(text) } }`,
 * also through variables set to another name. Parameters, imports and variables
 * set to anything else stay loggers.
 *
 * @param node - Logging call.
 * @param scopes - Scope analysis of the program.
 * @returns Whether the call is ordinary code.
 */
function isLocalCode(node: CallExpression, scopes: ScopeAnalysis): boolean {
  let root = unwrapExpression(node.callee)
  while (root.type === 'MemberExpression' || root.type === 'ChainExpression') {
    root = unwrapExpression(
      root.type === 'MemberExpression' ? root.object : root.expression,
    )
  }
  let binding = scopes.bindings.get(root)
  if (binding && root.type === 'Identifier' && root.name === 'console') {
    return true
  }
  let seen = new Set<Node>()
  while (binding && !seen.has(binding.declaration)) {
    let { declaration } = binding
    seen.add(declaration)
    if (declaration.type !== 'VariableDeclarator') {
      return (
        declaration.type === 'FunctionDeclaration' ||
        declaration.type === 'ClassDeclaration'
      )
    }
    let init = declaration.init && unwrapExpression(declaration.init)
    if (
      init?.type === 'ArrowFunctionExpression' ||
      init?.type === 'FunctionExpression' ||
      init?.type === 'ObjectExpression' ||
      init?.type === 'ClassExpression'
    ) {
      return true
    }
    binding = init ? scopes.bindings.get(init) : undefined
  }
  return false
}

/**
 * Tells whether a logging call is a method call of the global console, such as
 * `console.log` or `globalThis.console.log`, without optional links, non-null
 * assertions, computed keys or parentheses. Only then can evaluating the callee
 * not throw, so removing the call can only remove what it writes: any other
 * receiver or bare function may be nullish, not yet initialized or not a
 * function, as a parameter, a `let` or `context.logger` may be. A call in an
 * optional chain never gets here: the expression of its statement is the
 * chain.
 *
 * @param node - Logging call that is the expression of a statement.
 * @param scopes - Scope analysis of the program.
 * @returns Whether the callee is a method of the global console.
 */
function isConsoleCall(node: CallExpression, scopes: ScopeAnalysis): boolean {
  let { callee } = node
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    !consoleMethods.has(callee.property.name)
  ) {
    return false
  }
  let { object } = callee
  if (object.type === 'Identifier') {
    return object.name === 'console' && !scopes.bindings.has(object)
  }
  return (
    object.type === 'MemberExpression' &&
    !object.computed &&
    object.property.name === 'console' &&
    object.object.type === 'Identifier' &&
    consoleOwners.has(object.object.name) &&
    !scopes.bindings.has(object.object)
  )
}

/**
 * Tells whether an argument of a logging call can only add text to what the
 * call writes: the last one, or one that surely holds no format directive (see
 * `isFormatFree`), which would change how the arguments after it are
 * converted.
 *
 * @param argument - Argument of the call.
 * @param index - Position of the argument.
 * @param list - Arguments of the call.
 * @returns Whether the argument is message text.
 */
function isMessage(
  argument: Node,
  index: number,
  list: readonly Node[],
): boolean {
  return index === list.length - 1 || isFormatFree(argument)
}
