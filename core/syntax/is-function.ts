import type {
  Function as FunctionNode,
  ArrowFunctionExpression,
  Node,
} from 'oxc-parser'

/**
 * Types of the nodes that start a function.
 */
let functionTypes = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
])

/**
 * Tells whether a node starts a function, the boundary of every walk that stays
 * inside one function.
 *
 * @param node - Node to check.
 * @returns Whether the node is a function declaration, a function expression or
 *   an arrow function.
 */
export function isFunction(
  node: Node,
): node is ArrowFunctionExpression | FunctionNode {
  return functionTypes.has(node.type)
}
