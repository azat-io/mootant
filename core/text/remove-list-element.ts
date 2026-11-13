import type { ListExpression } from '../../types/syntax/list-expression'
import type { ParsedFile } from '../../types/source/parsed-file'

import { getListRemovalRange } from './get-list-removal-range'

/**
 * Builds the text of a list expression with one element removed: an array
 * element, an object member or a call argument, with the comma next to it (see
 * `getListRemovalRange`).
 *
 * @param parsed - File the node belongs to.
 * @param node - Array, object, call or `new` expression.
 * @param index - Position of the element to remove; it must not be a hole.
 * @returns Text of the node without the element.
 * @throws RangeError - When no element exists at the index.
 */
export function removeListElement(
  parsed: ParsedFile,
  node: ListExpression,
  index: number,
): string {
  let removed = getListRemovalRange(parsed, node, index)
  let { text } = parsed
  return (
    text.slice(node.start, removed.start) + text.slice(removed.end, node.end)
  )
}
