import type { Node } from 'oxc-parser'

import type { ValueBounds } from '../../types/syntax/value-bounds'

import { getValueBound } from './get-value-bound'

/**
 * Finds the lower bound of an expression that is never nullish, as
 * `getValueBound` finds it, for plugins that need only the number.
 *
 * @param bounds - Bounds of the names of the program whose values change.
 * @param node - Expression to bound.
 * @returns The lower bound, or null when it is not known or the value may be
 *   nullish.
 */
export function getLowerBound(bounds: ValueBounds, node: Node): number | null {
  let bound = getValueBound(bounds, node)
  return bound && !bound.nullable ? bound.lower : null
}
