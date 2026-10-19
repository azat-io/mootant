import type { Node } from 'oxc-parser'

import type { SourceRange } from '../../types/source/source-range'

import { unwrapExpression } from '../tree/unwrap-expression'
import { isPlainMessage } from './is-plain-message'

/**
 * Finds the literal text of an argument of a logging call, whose mutants can
 * only change the text the call writes: the argument itself when it is a string
 * literal or a template literal whose expressions are plain identifiers (see
 * `isPlainMessage`), or such operands of a `+` chain, through parentheses and
 * TypeScript wrappers. The other operands of the chain still run as before.
 *
 * @param node - Argument of the call.
 * @returns Ranges of the texts, in source order.
 */
export function findMessageTexts(node: Node): SourceRange[] {
  let argument = unwrapExpression(node)
  if (argument.type === 'BinaryExpression' && argument.operator === '+') {
    return [
      ...findMessageTexts(argument.left),
      ...findMessageTexts(argument.right),
    ]
  }
  if (
    (argument.type === 'Literal' && typeof argument.value === 'string') ||
    (argument.type === 'TemplateLiteral' && isPlainMessage(argument))
  ) {
    return [{ start: argument.start, end: argument.end }]
  }
  return []
}
