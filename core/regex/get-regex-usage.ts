import type { Node } from 'oxc-parser'

import type { SyntaxHelpers } from '../../types/syntax/syntax-helpers'

/**
 * String methods whose result depends on the `g` flag of a regular expression
 * passed as the first argument, without throwing or looping without it.
 */
let globalMethods = new Set(['replace', 'match'])

/**
 * Tells whether a regular expression literal is the first argument of a
 * `.replace` or `.match` method call, reached directly or through parentheses
 * and TypeScript expression wrappers. There the `g` flag decides between the
 * first match and all of them. Elsewhere removing `g` is equivalent, throws in
 * `matchAll` and `replaceAll`, or never ends a `while (re.exec(s))` loop. The
 * check is by method name.
 *
 * @param node - Regular expression literal.
 * @param syntax - Syntax helpers of the file.
 * @returns The method name, or null in any other position.
 */
export function getRegexUsage(
  node: Node,
  syntax: SyntaxHelpers,
): 'replace' | 'match' | null {
  let { parent, index } = syntax.getContextSlot(node)
  if (index !== 0 || parent?.type !== 'CallExpression') {
    return null
  }
  let callee = syntax.unwrapExpression(parent.callee)
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    !globalMethods.has(callee.property.name)
  ) {
    return null
  }
  return callee.property.name as 'replace' | 'match'
}
