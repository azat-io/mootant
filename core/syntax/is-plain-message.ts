import type { Node } from 'oxc-parser'

import { unwrapExpression } from '../tree/unwrap-expression'

/**
 * Tells whether an argument of a logging call is plain, so evaluating it can
 * neither throw nor have an effect, apart from converting a value to text: a
 * literal, a template literal whose expressions are plain identifiers, or a `+`
 * chain of those, through parentheses and TypeScript wrappers. Converting an
 * identifier's value, such as a `Symbol` or an object with its own `toString`,
 * is the accepted residual.
 *
 * @param node - Argument of the call.
 * @returns Whether the argument is plain.
 */
export function isPlainMessage(node: Node): boolean {
  let argument = unwrapExpression(node)
  switch (argument.type) {
    case 'BinaryExpression':
      return (
        argument.operator === '+' &&
        isPlainMessage(argument.left) &&
        isPlainMessage(argument.right)
      )
    case 'TemplateLiteral':
      return argument.expressions.every(
        expression => expression.type === 'Identifier',
      )
    case 'Literal':
      return true
    default:
      return false
  }
}
