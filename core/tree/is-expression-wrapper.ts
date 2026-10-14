import type {
  TSInstantiationExpression,
  ParenthesizedExpression,
  TSSatisfiesExpression,
  TSNonNullExpression,
  TSTypeAssertion,
  TSAsExpression,
  Node,
} from 'oxc-parser'

/**
 * Node that wraps a runtime expression without changing its value.
 */
type ExpressionWrapper =
  | TSInstantiationExpression
  | ParenthesizedExpression
  | TSSatisfiesExpression
  | TSNonNullExpression
  | TSTypeAssertion
  | TSAsExpression

/**
 * Types of the expression wrappers. A wrapper holds a runtime node only under
 * `expression`: its type children are not indexed.
 */
let wrapperTypes = new Set<string>([
  'TSInstantiationExpression',
  'ParenthesizedExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSAsExpression',
])

/**
 * Tells whether a node is parentheses or one of the TypeScript expression
 * wrappers `x as T`, `x satisfies T`, `x!`, `<T>x` and `f<T>`, which pass the
 * value of their `expression` on unchanged.
 *
 * @param node - Node to check.
 * @returns Whether the node is parentheses or a TypeScript expression wrapper.
 */
export function isExpressionWrapper(node: Node): node is ExpressionWrapper {
  return wrapperTypes.has(node.type)
}
