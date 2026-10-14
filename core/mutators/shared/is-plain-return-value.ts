import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { isNullishConstant } from './is-nullish-constant'
import { getLiteralValue } from './get-literal-value'

/**
 * Tells whether a returned expression is one that return-value never replaces
 * (catalog 4.14, eligible expressions, read by 4.15 for early returns): a
 * literal (a negative number literal included), `undefined`, `void x`, `this`,
 * a function or a class expression. Logging calls are left out: return-value
 * skips them too, but statement-removal does not count them.
 *
 * @param value - Returned expression, through wrappers.
 * @param context - Mutator context of the file.
 * @returns Whether the value is such an expression.
 */
export function isPlainReturnValue(
  value: Node,
  context: MutatorContext,
): boolean {
  switch (value.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'ClassExpression':
    case 'ThisExpression':
    case 'Literal':
      return true
    case 'UnaryExpression':
      return value.operator === 'void' || getLiteralValue(value) !== null
    case 'Identifier':
      return isNullishConstant(value, context)
    default:
      return false
  }
}
