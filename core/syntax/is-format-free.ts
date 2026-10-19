import type { Node } from 'oxc-parser'

import { unwrapExpression } from '../tree/unwrap-expression'

/**
 * Tells whether an argument of a logging call surely holds no format directive,
 * such as `%j` or `%d`, which makes the logger convert the arguments after it
 * in ways that may throw or run user code: a literal that is not a string, or a
 * string or template literal without expressions whose value, with escapes
 * decoded (`\x25` is `%`), holds no `%`, through parentheses and TypeScript
 * wrappers. Anything else, such as a name, a `+` chain or a template whose
 * value is unknown for an invalid escape, may hold a directive.
 *
 * @param node - Argument of the call.
 * @returns Whether the argument is free of format directives.
 */
export function isFormatFree(node: Node): boolean {
  let argument = unwrapExpression(node)
  if (argument.type === 'Literal') {
    return typeof argument.value !== 'string' || !argument.value.includes('%')
  }
  if (argument.type !== 'TemplateLiteral' || argument.expressions.length > 0) {
    return false
  }
  let { cooked } = argument.quasis[0]!.value
  return typeof cooked === 'string' && !cooked.includes('%')
}
