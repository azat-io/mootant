import type { LogicalExpression, Node } from 'oxc-parser'

import { unwrapParentheses } from '../tree/unwrap-parentheses'

/**
 * Collects the operands of the same-operator chain below a logical expression,
 * left to right. An operand that is, through parentheses, a logical expression
 * with the same operator is expanded into its operands, so `a && b && c` and `a
 * && (b && c)` both give `a`, `b` and `c`. Other operands are returned as
 * written, parentheses included. The walk keeps an explicit stack, so long
 * chains cannot overflow the call stack.
 *
 * @param node - Logical expression at the top of the chain.
 * @returns Operands of the chain in source order.
 */
export function getLogicalChain(node: LogicalExpression): Node[] {
  let operands: Node[] = []
  let pending: Node[] = [node.right, node.left]
  let operand = pending.pop()
  while (operand) {
    let inner = unwrapParentheses(operand)
    if (
      inner.type === 'LogicalExpression' &&
      inner.operator === node.operator
    ) {
      pending.push(inner.right, inner.left)
    } else {
      operands.push(operand)
    }
    operand = pending.pop()
  }
  return operands
}
