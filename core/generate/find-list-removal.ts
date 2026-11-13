import type { ObjectExpression, ArrayExpression, Node } from 'oxc-parser'

import type { ListRemoval } from '../../types/mutant/list-removal'
import type { Replacement } from '../../types/mutator/replacement'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { isSpreadSafeMember } from '../syntax/is-spread-safe-member'

/**
 * Positions of the elements or members of each literal whose removal is not
 * narrowed, found once per literal.
 */
let wholeRemovals = new WeakMap<Node, ReadonlySet<number>>()

/**
 * Tells whether a replacement removes one element of an array literal or one
 * member of an object literal: its text is empty and its node is an element or
 * member of a literal in the runtime tree. The removal is narrowed to the
 * element unless the copy of the literal that leaves an element out could not
 * be built around it: in an array with a hole, which the copy would read and
 * fill, or for a member that a spread would change (see `isSpreadSafeMember`).
 * In a Svelte template no removal is narrowed, since the compiler reads class
 * values as written.
 *
 * @param tree - Runtime tree of the file.
 * @param replacement - Replacement a mutator returned.
 * @param template - Whether the tree is the code of a Svelte template.
 * @returns The literal, the position, whether the removal is narrowed and how
 *   many removals of the literal are not, or null for any other replacement.
 */
export function findListRemoval(
  tree: TreeIndex,
  replacement: Replacement,
  template: boolean,
): ListRemoval | null {
  let slot = tree.slots.get(replacement.node)
  if (!slot || replacement.text !== '') {
    return null
  }
  let { parent, index } = slot
  if (
    index === null ||
    (parent?.type !== 'ArrayExpression' && parent?.type !== 'ObjectExpression')
  ) {
    return null
  }
  let whole = wholeRemovals.get(parent)
  if (whole === undefined) {
    whole = findWholeRemovals(parent, template)
    wholeRemovals.set(parent, whole)
  }
  return {
    kind: parent.type === 'ArrayExpression' ? 'element' : 'property',
    narrow: !whole.has(index),
    copies: whole.size,
    list: parent,
    index,
  }
}

/**
 * Finds the elements or members of a literal whose removal replaces the whole
 * literal: every element of an array with a hole, every member of an object
 * that a spread would change, and every one in a Svelte template.
 *
 * @param list - Array or object literal.
 * @param template - Whether the literal is in a Svelte template.
 * @returns Their positions in the literal.
 */
function findWholeRemovals(
  list: ObjectExpression | ArrayExpression,
  template: boolean,
): Set<number> {
  let positions = new Set<number>()
  if (list.type === 'ArrayExpression') {
    if (template || list.elements.includes(null)) {
      for (let [index, element] of list.elements.entries()) {
        if (element !== null) {
          positions.add(index)
        }
      }
    }
    return positions
  }
  for (let [index, member] of list.properties.entries()) {
    if (template || !isSpreadSafeMember(member)) {
      positions.add(index)
    }
  }
  return positions
}
