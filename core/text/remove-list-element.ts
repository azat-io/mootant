import type { Node } from 'oxc-parser'

import type { ListExpression } from '../../types/syntax/list-expression'
import type { SourceRange } from '../../types/source/source-range'
import type { ParsedFile } from '../../types/source/parsed-file'

import { findTokenStart } from './find-token-start'

/**
 * Builds the text of a list expression with one element removed: an array
 * element, an object member or a call argument. Removing the only element
 * empties the delimiters, removing an element that is not the last deletes up
 * to the start of the next one (its indentation is kept), and removing the last
 * element deletes from the comma before it.
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
  let elements = getListElements(node)
  let element = elements[index]
  if (!element) {
    throw new RangeError(`List element ${index} does not exist.`)
  }

  let delimiters = getListDelimiters(parsed, node)
  let starts = getSlotStarts(parsed, elements, delimiters)
  let removed: SourceRange
  if (elements.length === 1) {
    removed = { start: delimiters.start + 1, end: delimiters.end }
  } else if (index < elements.length - 1) {
    removed = { end: starts[index + 1]!, start: element.start }
  } else {
    let previous = elements[index - 1]
    removed = {
      start:
        previous ?
          findTokenStart(parsed, previous.end, delimiters.end)
        : starts[index - 1]! + 1,
      end: element.end,
    }
  }

  let { text } = parsed
  return (
    text.slice(node.start, removed.start) + text.slice(removed.end, node.end)
  )
}

/**
 * Locates the delimiters of a list: the brackets or braces of an array or
 * object, the parentheses of a call. The opening parenthesis is the first `(`
 * after the callee and its type arguments, past white space, comments and a
 * `?.` token.
 *
 * @param parsed - File the list belongs to.
 * @param node - Array, object, call or `new` expression.
 * @returns Offset of the opening delimiter as `start` and of the closing one as
 *   `end`.
 */
function getListDelimiters(
  parsed: ParsedFile,
  node: ListExpression,
): SourceRange {
  if (node.type === 'ArrayExpression' || node.type === 'ObjectExpression') {
    return { start: node.start, end: node.end - 1 }
  }

  let offset = (node.typeArguments ?? node.callee).end
  while (parsed.text[offset] !== '(') {
    offset = parsed.commentEnds.get(offset) ?? offset + 1
  }
  return { end: node.end - 1, start: offset }
}

/**
 * Finds where each slot of a list starts: at its element, or at the comma of a
 * hole.
 *
 * @param parsed - File the list belongs to.
 * @param elements - Elements of the list, null for holes.
 * @param delimiters - Offsets of the opening and the closing delimiter.
 * @returns Start offset of every slot.
 */
function getSlotStarts(
  parsed: ParsedFile,
  elements: readonly (Node | null)[],
  delimiters: SourceRange,
): number[] {
  let starts: number[] = []
  let cursor = delimiters.start + 1
  for (let element of elements) {
    let start = element?.start ?? findTokenStart(parsed, cursor, delimiters.end)
    starts.push(start)
    cursor = findTokenStart(parsed, element?.end ?? start, delimiters.end) + 1
  }
  return starts
}

/**
 * Reads the comma-separated list of a node.
 *
 * @param node - Array, object, call or `new` expression.
 * @returns Elements, members or arguments, with null for array holes.
 */
function getListElements(node: ListExpression): readonly (Node | null)[] {
  if (node.type === 'ArrayExpression') {
    return node.elements
  }
  if (node.type === 'ObjectExpression') {
    return node.properties
  }
  return node.arguments
}
