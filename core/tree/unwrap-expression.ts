import type { Node } from 'oxc-parser'

import { isExpressionWrapper } from './is-expression-wrapper'

/**
 * Strips parentheses and the TypeScript expression wrappers `x as T`, `x
 * satisfies T`, `x!`, `<T>x` and `f<T>` from a node.
 *
 * @param node - Node that may be wrapped, once or several times.
 * @returns The first node inside the wrappers that is not itself a wrapper.
 */
export function unwrapExpression(node: Node): Node {
  let current = node
  while (isExpressionWrapper(current)) {
    current = current.expression
  }
  return current
}
