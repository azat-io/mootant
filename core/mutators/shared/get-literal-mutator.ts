import type { Node } from 'oxc-parser'

import { getLiteralValue } from './get-literal-value'

/**
 * Finds the mutator that changes a literal (catalog 5.1): boolean-literal,
 * number-literal (also for `-` applied to a number literal) or string-literal
 * (also for a template literal).
 *
 * @param node - Node that a literal mutator would replace.
 * @returns The id of the literal mutator, or null for any other node.
 */
export function getLiteralMutator(node: Node): string | null {
  if (node.type === 'TemplateLiteral') {
    return 'string-literal'
  }
  if (node.type === 'ParenthesizedExpression') {
    return null
  }
  switch (typeof getLiteralValue(node)) {
    case 'boolean':
      return 'boolean-literal'
    case 'string':
      return 'string-literal'
    case 'number':
    case 'bigint':
      return 'number-literal'
    default:
      return null
  }
}
