import type { ArrayPattern, Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { ReadCheck } from '../../types/syntax/read-check'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { readNumberLiteral } from './read-number-literal'
import { getContextSlot } from '../tree/get-context-slot'
import { isWrittenMember } from './is-written-member'
import { getCheckedName } from './get-checked-name'
import { isPresenceTest } from './is-presence-test'

/**
 * Finds what code reads of the result of a `match` call whose regular
 * expression has the `g` flag. Without `g` the result also has `index`,
 * `input`, `groups` and the capturing groups, so the flag shows wherever code
 * reads the whole result. These reads do not show it:
 *
 * - `first`: only whether there is a match (see `isPresenceTest`), and the whole
 *   of the first match, as element 0 or the one element of an array pattern.
 * - `length`: these and the `length`, which is the same for a pattern without
 *   capturing groups that matches at most once.
 *
 * A write or a `delete` of such a member does not count as a read (see
 * `isWrittenMember`): a function written to element 0 and called from there
 * gets the whole result as `this`.
 *
 * The result reaches a read directly, through the end of an optional chain, as
 * an operand of `||` or `??`, as the right operand of `&&`, or through a name
 * that the expression always initializes when each read of the name is of the
 * same kind (see `getCheckedName`). Parentheses and TypeScript expression
 * wrappers are looked through.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Call of `match`.
 * @returns What the code reads, or null when it may read anything else.
 */
export function getMatchResultUse(
  program: AnalyzedProgram,
  node: Node,
): 'length' | 'first' | null {
  if (isReadBy(program, node, readsFirstMatch)) {
    return 'first'
  }
  return isReadBy(program, node, readsFirstMatchOrLength) ? 'length' : null
}

/**
 * Tells whether a read of a match result sees at most whether there is a match
 * and the whole of the first one.
 *
 * @param tree - Runtime tree of the program.
 * @param node - Match result or a name that holds it, in the runtime tree.
 * @returns Whether the `g` flag does not show in the read.
 */
function readsFirstMatch(tree: TreeIndex, node: Node): boolean {
  let value = getValueEnd(tree, node)
  if (isPresenceTest(tree, value)) {
    return true
  }
  let { parent, key } = getContextSlot(tree, value)
  switch (parent?.type) {
    case 'VariableDeclarator':
      return parent.id.type === 'ArrayPattern' && takesOneElement(parent.id)
    case 'MemberExpression':
      return (
        key === 'object' &&
        readNumberLiteral(parent.property) === 0 &&
        !isWrittenMember(tree, parent)
      )
    default:
      return false
  }
}

/**
 * Tells whether a read of a match result sees at most whether there is a match,
 * the whole of the first one and the length.
 *
 * @param tree - Runtime tree of the program.
 * @param node - Match result or a name that holds it, in the runtime tree.
 * @returns Whether the `g` flag does not show in the read of a pattern that has
 *   no capturing groups and matches at most once.
 */
function readsFirstMatchOrLength(tree: TreeIndex, node: Node): boolean {
  if (readsFirstMatch(tree, node)) {
    return true
  }
  let { parent, key } = getContextSlot(tree, getValueEnd(tree, node))
  return (
    key === 'object' &&
    parent?.type === 'MemberExpression' &&
    !parent.computed &&
    parent.property.name === 'length' &&
    !isWrittenMember(tree, parent)
  )
}

/**
 * Finds the expression through which a match result goes on: the end of its
 * optional chain, and an `||`, a `??` or the right side of an `&&` around it,
 * whose value may be the result. Through the left side of an `&&` only a falsy
 * value goes on.
 *
 * @param tree - Runtime tree of the program.
 * @param node - Match result or a name that holds it, in the runtime tree.
 * @returns The outermost such expression, or the node.
 */
function getValueEnd(tree: TreeIndex, node: Node): Node {
  let current = node
  for (;;) {
    let { parent, key } = getContextSlot(tree, current)
    if (
      parent?.type !== 'ChainExpression' &&
      (parent?.type !== 'LogicalExpression' ||
        (key === 'left' && parent.operator === '&&'))
    ) {
      return current
    }
    current = parent
  }
}

/**
 * Tells whether a check passes for the result of a call, either where the call
 * stands or at every read of the name it initializes.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Call of `match`.
 * @param check - Check of a read.
 * @returns Whether the result goes only to reads that pass the check.
 */
function isReadBy(
  program: AnalyzedProgram,
  node: Node,
  check: ReadCheck,
): boolean {
  let { tree } = program
  return (
    check(tree, node) ||
    getCheckedName(program, getValueEnd(tree, node), check) !== null
  )
}

/**
 * Tells whether an array pattern reads one element, the first, and no rest.
 *
 * @param pattern - Array pattern.
 * @returns Whether the pattern holds one place that is not a rest element.
 */
function takesOneElement(pattern: ArrayPattern): boolean {
  let [first] = pattern.elements
  return pattern.elements.length === 1 && first?.type !== 'RestElement'
}
