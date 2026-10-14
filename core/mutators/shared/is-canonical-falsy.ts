import type { Node } from 'oxc-parser'

import type { TypeView } from './get-type-view'

import { unwrapExpression } from '../../tree/unwrap-expression'
import { getCanonicalFalsy } from './get-canonical-falsy'
import { getLiteralValue } from './get-literal-value'

/**
 * Tells whether an expression is the only falsy value of a type that is not
 * nullish (catalog 3.3, `canonicalFalsy`): `''` or an empty template for a
 * string, `0` for a number, `0n` for a BigInt and `false` for a boolean.
 *
 * @param type - Type of the catalog's view, usually of the other operand.
 * @param node - Expression to check, through parentheses and TypeScript
 *   wrappers.
 * @returns Whether the expression is that literal.
 */
export function isCanonicalFalsy(type: TypeView['type'], node: Node): boolean {
  let value = getLiteralValue(unwrapExpression(node))
  return value !== null && getCanonicalFalsy(type) === value
}
