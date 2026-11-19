import type { CallExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { unwrapExpression } from '../../tree/unwrap-expression'
import { walkTree } from '../../tree/walk-tree'

/**
 * Node types that run code or change state when evaluated, or that hold code
 * another expression may run, as `isEffectFree` counts them, apart from calls
 * and arrow functions, which are judged one by one.
 */
let effectTypes = new Set<string>([
  'TaggedTemplateExpression',
  'AssignmentExpression',
  'FunctionExpression',
  'ImportExpression',
  'UpdateExpression',
  'AwaitExpression',
  'YieldExpression',
  'ClassExpression',
  'NewExpression',
  'SpreadElement',
])

/**
 * Methods that only read their receiver and arguments: common read-only methods
 * of strings, arrays, maps, sets and dates, and static methods of `Array`,
 * `Number` and `Object` that only read their arguments. `get` is left out, as
 * caches move the entry they return.
 */
let readMethods = new Set([
  'toLocaleLowerCase',
  'toLocaleUpperCase',
  'hasOwnProperty',
  'localeCompare',
  'isSafeInteger',
  'codePointAt',
  'lastIndexOf',
  'toLowerCase',
  'toUpperCase',
  'charCodeAt',
  'startsWith',
  'isInteger',
  'normalize',
  'substring',
  'trimStart',
  'endsWith',
  'includes',
  'isFinite',
  'padStart',
  'getTime',
  'indexOf',
  'isArray',
  'trimEnd',
  'entries',
  'charAt',
  'concat',
  'hasOwn',
  'padEnd',
  'repeat',
  'values',
  'isNaN',
  'slice',
  'join',
  'keys',
  'trim',
  'has',
  'at',
])

/**
 * Methods of arrays that only read the array and call their first argument with
 * each element.
 */
let callbackMethods = new Set([
  'findLastIndex',
  'findIndex',
  'findLast',
  'filter',
  'every',
  'find',
  'some',
  'map',
])

/**
 * Methods of a regular expression that run it.
 */
let regexMethods = new Set(['exec', 'test'])

/**
 * Tells whether evaluating an expression only reads values, judged as
 * `isEffectFree` judges it, except that a call counts as a read when its method
 * only reads values and its receiver and arguments only read values too: a
 * read-only method of a string, an array, a map, a set or a date, such as `has`
 * or `includes`, or a static method of `Array`, `Number` or `Object` that only
 * reads its arguments, such as `isArray`, also in an optional chain. A method
 * that calls its first argument with each element, such as `some`, counts when
 * that argument is an arrow function that is not async and has an expression
 * body, whose parameters and body are judged the same way. `test` and `exec`
 * count on a regular expression literal, which makes a new object on each
 * evaluation, or on a name declared once with `let` or `const` and a literal
 * without the `g` and `y` flags and never written, so that a run leaves
 * `lastIndex` as it is, while the file does not read the legacy properties of
 * `RegExp` (see `readsRegexStatics`). The methods are recognized by name, which
 * is a guess: an arbitrary object may define a method of the same name that
 * changes state. Any other call, such as one of a function of the project,
 * counts as an effect.
 *
 * @param node - Expression to check.
 * @param context - Mutator context of the file.
 * @returns Whether the expression and every part of it only read values.
 */
export function isReadOnly(node: Node, context: MutatorContext): boolean {
  let callbacks = new Set<Node>()
  let readOnly = true
  walkTree(node, child => {
    if (readOnly && !isReadNode(child, callbacks, context)) {
      readOnly = false
    }
    return readOnly
  })
  return readOnly
}

/**
 * Tells whether running a regular expression with `test` or `exec` leaves
 * nothing that code may read: the receiver is a regular expression literal, or
 * a name declared once with `let` or `const` and a literal without the `g` and
 * `y` flags and never written, and the file does not read what the last match
 * took. A `var` may be declared again with another literal.
 *
 * @param node - Receiver of the call.
 * @param context - Mutator context of the file.
 * @returns Whether running the regular expression only reads values.
 */
function runsWithoutTrace(node: Node, context: MutatorContext): boolean {
  let { sourceCode, syntax } = context
  if (syntax.readsRegexStatics()) {
    return false
  }
  let receiver = unwrapExpression(node)
  if (receiver.type === 'Literal' && 'regex' in receiver) {
    return true
  }
  let binding = sourceCode.getBinding(receiver)
  let declaration =
    binding?.kind !== 'var' && binding?.writes.length === 0 ?
      binding.declaration
    : null
  let literal =
    (
      declaration?.type === 'VariableDeclarator' &&
      declaration.id.type === 'Identifier' &&
      declaration.init
    ) ?
      unwrapExpression(declaration.init)
    : null
  return (
    literal?.type === 'Literal' &&
    'regex' in literal &&
    !/[gy]/u.test(literal.regex.flags)
  )
}

/**
 * Tells whether a call only reads values as far as its method tells, and notes
 * the arrow function that a method with a callback runs with each element, so
 * that the walk judges its parameters and body as code of the expression.
 *
 * @param call - Call expression.
 * @param callbacks - Arrow functions that the read-only calls run, to add to.
 * @param context - Mutator context of the file.
 * @returns Whether the call itself only reads values.
 */
function isReadCall(
  call: CallExpression,
  callbacks: Set<Node>,
  context: MutatorContext,
): boolean {
  let callee = unwrapExpression(call.callee)
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property.type !== 'Identifier'
  ) {
    return false
  }
  let { name } = callee.property
  if (regexMethods.has(name)) {
    return runsWithoutTrace(callee.object, context)
  }
  if (!callbackMethods.has(name)) {
    return readMethods.has(name)
  }
  let [first] = call.arguments
  let callback = first ? unwrapExpression(first) : null
  if (
    callback?.type !== 'ArrowFunctionExpression' ||
    !callback.expression ||
    callback.async
  ) {
    return false
  }
  callbacks.add(callback)
  return true
}

/**
 * Tells whether evaluating a node only reads values, apart from what its
 * children do, which the walk judges on its own.
 *
 * @param node - Node of the expression.
 * @param callbacks - Arrow functions that the read-only calls run, to add to.
 * @param context - Mutator context of the file.
 * @returns Whether the node itself only reads values.
 */
function isReadNode(
  node: Node,
  callbacks: Set<Node>,
  context: MutatorContext,
): boolean {
  switch (node.type) {
    case 'ArrowFunctionExpression':
      return callbacks.has(node)
    case 'UnaryExpression':
      return node.operator !== 'delete'
    case 'CallExpression':
      return isReadCall(node, callbacks, context)
    default:
      return !effectTypes.has(node.type)
  }
}
