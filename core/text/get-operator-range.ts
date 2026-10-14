import type { OperatorExpression } from '../../types/operator-expression'
import type { SourceRange } from '../../types/source-range'
import type { ParsedFile } from '../../types/parsed-file'

import { findTokenStart } from './find-token-start'

/**
 * Locates the operator token of an expression. A binary, logical, private-in or
 * assignment operator is the first token between the operands; a unary operator
 * is always a prefix; an update operator is a prefix or a suffix.
 *
 * @param parsed - File the node belongs to.
 * @param node - Expression whose operator is located.
 * @returns Range of the operator token.
 * @throws Error - When the text between the operands does not start with the
 *   operator of the node.
 */
export function getOperatorRange(
  parsed: ParsedFile,
  node: OperatorExpression,
): SourceRange {
  if (node.type === 'UnaryExpression') {
    return { end: node.start + node.operator.length, start: node.start }
  }
  if (node.type === 'UpdateExpression') {
    return node.prefix ?
        { end: node.start + 2, start: node.start }
      : { start: node.end - 2, end: node.end }
  }

  let start = findTokenStart(parsed, node.left.end, node.right.start)
  if (start === -1 || !parsed.text.startsWith(node.operator, start)) {
    throw new Error(
      `Operator "${node.operator}" not found between the operands.`,
    )
  }
  return { end: start + node.operator.length, start }
}
