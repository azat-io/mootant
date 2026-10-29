import type { Node } from 'oxc-parser'

import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { isNumberLiteral } from './is-number-literal'

/**
 * Number literal that comparison-operator shifts, and the step it adds.
 */
export interface ShiftedLiteral {
  /**
   * Number literal operand of the comparison, without parentheses.
   */
  literal: Node

  /**
   * Amount the shifted literal adds to the literal.
   */
  step: -1 | 1
}

/**
 * Relational operators, whose plans shift a number literal operand.
 */
let relationalOperators = new Set(['<=', '>=', '<', '>'])

/**
 * Finds the literal that comparison-operator shifts in a relational comparison
 * with exactly one number literal operand (catalog 4.6), and the step: strict
 * operators shrink the true region, non-strict ones grow it. With a step of
 * one, the shifted literal is number-literal's change of that literal.
 *
 * @param node - Node of the runtime tree.
 * @returns The literal and the step, or null when the node is not such a
 *   comparison.
 */
export function getShiftedLiteral(node: Node): ShiftedLiteral | null {
  if (
    node.type !== 'BinaryExpression' ||
    !relationalOperators.has(node.operator)
  ) {
    return null
  }
  let leftLiteral = isNumberLiteral(node.left)
  if (leftLiteral === isNumberLiteral(node.right)) {
    return null
  }
  let shrinks = node.operator === '<' || node.operator === '>='
  return {
    literal: unwrapParentheses(leftLiteral ? node.left : node.right),
    step: shrinks === leftLiteral ? 1 : -1,
  }
}
