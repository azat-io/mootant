import type { Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { getContextSlot } from '../tree/get-context-slot'
import { getCheckedName } from './get-checked-name'
import { isPresenceTest } from './is-presence-test'

/**
 * Tells whether code asks a regular expression only whether it matches, never
 * what it matched: the regex is, through parentheses and TypeScript wrappers,
 * the receiver of a call of `test`, or of a call of `exec` whose result only
 * counts as present or not (see `isPresenceTest`), or the initializer that
 * always gives a name its value when the program holds every read of the name,
 * at least one, and each read is such a receiver (see `getClosedInitializer`).
 * With the `y` flag a match must start where the last one ended, so such a
 * regex does not count. With the `g` flag a name does not count either, since
 * where a match ended decides where the next run of the same object starts,
 * while a literal or a `RegExp` call in the call is a new object each time. The
 * methods are the regex's own, since the receiver holds a regular expression;
 * the built-ins are assumed not to be patched.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Regular expression literal or `RegExp` call.
 * @param flags - Flags of the regular expression.
 * @returns Whether only the fact of a match is used.
 */
export function isRegexOnlyTested(
  program: AnalyzedProgram,
  node: Node,
  flags: string,
): boolean {
  if (flags.includes('y')) {
    return false
  }
  return (
    asksWhetherMatches(program.tree, node) ||
    (!flags.includes('g') &&
      getCheckedName(program, node, asksWhetherMatches) !== null)
  )
}

/**
 * Tells whether a read of a regular expression only asks whether it matches: it
 * is, through parentheses and TypeScript wrappers, the receiver of a call of
 * `test`, or of a call of `exec` whose result only counts as present or not.
 *
 * @param tree - Runtime tree of the program.
 * @param node - Regular expression or a name that holds one, in the runtime
 *   tree.
 * @returns Whether the read gives away nothing but the fact of a match.
 */
function asksWhetherMatches(tree: TreeIndex, node: Node): boolean {
  let { parent, key } = getContextSlot(tree, node)
  if (
    key !== 'object' ||
    parent?.type !== 'MemberExpression' ||
    parent.computed
  ) {
    return false
  }
  let call = getContextSlot(tree, parent)
  if (call.key !== 'callee' || call.parent?.type !== 'CallExpression') {
    return false
  }
  switch (parent.property.name) {
    case 'test':
      return true
    case 'exec':
      return isPresenceTest(tree, call.parent)
    default:
      return false
  }
}
