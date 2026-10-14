import type { Node } from 'oxc-parser'

/**
 * Pattern of the type names of statements and declarations.
 */
const STATEMENT_PATTERN = /(?:Declaration|Statement)$/u

/**
 * Tells whether a node is a statement or a declaration, by its type name.
 *
 * @param node - Node to check.
 * @returns Whether the type name of the node ends with `Statement` or
 *   `Declaration`.
 */
export function isStatement(node: Node): boolean {
  return STATEMENT_PATTERN.test(node.type)
}
