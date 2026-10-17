import type { Node } from 'oxc-parser'

import { unwrapExpression } from '../tree/unwrap-expression'

/**
 * Reads the type of a literal-only expression: a number or string literal, or a
 * template without substitutions, optionally combined by unary `+` and `-`, the
 * arithmetic operators `+`, `-`, `*`, `/`, `%` and `**`, parentheses and
 * TypeScript wrappers. Such an expression reads no name, calls nothing and
 * cannot throw. Its value is a string when it is a string or a `+` with a
 * string operand, and a number otherwise. A BigInt or regular expression
 * literal, a substitution, a name, a member read and a call are not literal
 * only.
 *
 * @param node - Expression to read.
 * @returns The type of its value, or null when it is not literal only.
 */
export function readLiteralType(node: Node): 'number' | 'string' | null {
  let current = unwrapExpression(node)
  switch (current.type) {
    case 'BinaryExpression': {
      let left = readLiteralType(current.left)
      let right = readLiteralType(current.right)
      if (left === null || right === null) {
        return null
      }
      switch (current.operator) {
        case '**':
        case '%':
        case '*':
        case '-':
        case '/':
          return 'number'
        case '+':
          return left === 'string' || right === 'string' ? 'string' : 'number'
        default:
          return null
      }
    }
    case 'UnaryExpression':
      return (
          (current.operator === '+' || current.operator === '-') &&
            readLiteralType(current.argument) !== null
        ) ?
          'number'
        : null
    case 'TemplateLiteral':
      return current.expressions.length === 0 ? 'string' : null
    case 'Literal': {
      let type = typeof current.value
      return type === 'number' || type === 'string' ? type : null
    }
    default:
      return null
  }
}
