import type { Node } from 'oxc-parser'

import { unwrapExpression } from '../tree/unwrap-expression'
import { getMemberPath } from './get-member-path'

/**
 * Tells whether the first argument of a child-logger factory is only a label: a
 * literal, a name or a member read, a template literal of those, or an object
 * literal of plain properties with such values, like the pino bindings in
 * `logger.child({ module })`. Calls, functions, spreads, computed keys and
 * regular expressions can change what the program does, so an argument with any
 * of them is not a label.
 *
 * @param node - First argument of the factory call.
 * @returns Whether the argument is only a label.
 */
export function isLoggerLabel(node: Node): boolean {
  let value = unwrapExpression(node)
  if (value.type === 'ObjectExpression') {
    return value.properties.every(
      property =>
        property.type === 'Property' &&
        property.kind === 'init' &&
        !property.computed &&
        !property.method &&
        isLabelValue(property.value),
    )
  }
  return isLabelValue(value)
}

/**
 * Tells whether a value of a label holds no code: a literal other than a
 * regular expression, a name or a member read without calls, or a template
 * literal whose substitutions are such values.
 *
 * @param node - Value to check.
 * @returns Whether the value holds no code.
 */
function isLabelValue(node: Node): boolean {
  let value = unwrapExpression(node)
  switch (value.type) {
    case 'TemplateLiteral':
      return value.expressions.every(isLabelValue)
    case 'Literal':
      return !('regex' in value)
    default:
      return getMemberPath(value) !== null
  }
}
