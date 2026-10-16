import type { Node } from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'

import { unwrapExpression } from '../tree/unwrap-expression'

/**
 * Types of the expressions whose value is always a primitive, never a thenable.
 */
let primitiveTypes = new Set<string>([
  'BinaryExpression',
  'UpdateExpression',
  'TemplateLiteral',
  'UnaryExpression',
])

/**
 * Types of the expressions that create a function without a `then` property.
 */
let functionTypes = new Set<string>([
  'ArrowFunctionExpression',
  'FunctionExpression',
])

/**
 * Tells whether an expression is known from its syntax not to be a thenable, so
 * that a promise resolved with it does not take on its state: a literal other
 * than a regular expression, a template literal, the result of a unary, binary
 * or update operator, the undeclared `undefined`, a function or arrow function
 * expression, or a logical or conditional expression of such values. Names,
 * member reads, calls, `new`, objects, arrays, classes, which can have a static
 * `then`, and regular expressions are not known. A `then` added to a built-in
 * prototype is not known, so it does not count.
 *
 * @param scopes - Scope analysis of the file.
 * @param node - Expression to check.
 * @returns Whether the value of the expression is never a thenable.
 */
export function isNonThenable(scopes: ScopeAnalysis, node: Node): boolean {
  let value = unwrapExpression(node)
  switch (value.type) {
    case 'ConditionalExpression':
      return (
        isNonThenable(scopes, value.consequent) &&
        isNonThenable(scopes, value.alternate)
      )
    case 'LogicalExpression':
      return (
        isNonThenable(scopes, value.left) && isNonThenable(scopes, value.right)
      )
    case 'Identifier':
      return value.name === 'undefined' && !scopes.bindings.has(value)
    case 'Literal':
      return !('regex' in value)
    default:
      return primitiveTypes.has(value.type) || functionTypes.has(value.type)
  }
}
