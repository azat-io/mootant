import type { Node } from 'oxc-parser'

import type { ListExpression } from '../../types/syntax/list-expression'
import type { SourceRange } from '../../types/source/source-range'
import type { ParsedFile } from '../../types/source/parsed-file'

import { findTokenStart } from './find-token-start'

/**
 * Finds the text that removing one element of a list expression deletes: an
 * array element, an object member or a call argument, with one comma next to
 * it, so the list stays well formed. Removing the only element deletes
 * everything between the delimiters, removing an element that is not the last
 * deletes up to the start of the next one (its indentation is kept), and
 * removing the last element deletes from the comma before it, or, when a comma
 * follows it at once, from just after the comma before it through the one after
 * it, which leaves the same text. The comma of a hole before the last element
 * is kept. Removing either of two equal neighbors written alike leaves the same
 * text.
 *
 * @param parsed - File the node belongs to.
 * @param node - Array, object, call or `new` expression.
 * @param index - Position of the element to remove; it must not be a hole.
 * @returns Range of the deleted text.
 * @throws RangeError - When no element exists at the index.
 */
export function getListRemovalRange(
  parsed: ParsedFile,
  node: ListExpression,
  index: number,
): SourceRange {
  let elements = getListElements(node)
  let element = elements[index]
  if (!element) {
    throw new RangeError(`List element ${index} does not exist.`)
  }

  let delimiters = getListDelimiters(parsed, node)
  if (elements.length === 1) {
    return { start: delimiters.start + 1, end: delimiters.end }
  }
  if (index < elements.length - 1) {
    return {
      end:
        elements[index + 1]?.start ??
        getSlotStarts(parsed, elements, delimiters)[index + 1]!,
      start: element.start,
    }
  }
  let previous = elements[index - 1]
  let comma =
    previous ?
      findTokenStart(parsed, previous.end, delimiters.end)
    : getSlotStarts(parsed, elements, delimiters)[index - 1]!
  if (parsed.text[element.end] === ',') {
    return { end: element.end + 1, start: comma + 1 }
  }
  return { start: previous ? comma : comma + 1, end: element.end }
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
