import type { Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'

import { getClosedInitializer } from './get-closed-initializer'
import { getContextSlot } from '../tree/get-context-slot'
import { isTruthTest } from './is-truth-test'

/**
 * Finds the name that an expression initializes when its value only reaches
 * truth positions through that name (catalog 4.8, N3): the expression is,
 * through parentheses and TypeScript wrappers, the initializer that always
 * gives the name its value; the program holds every read of the name; and the
 * name is read at least once, every read being a node of the runtime tree (see
 * `getClosedInitializer`) whose truth alone is tested (see `isTruthTest`). A
 * read outside the runtime tree, such as an `export { x }` specifier, passes
 * the value on. The result of a predicate callback and the argument of
 * `Boolean` do not count: only a method name marks the callback, and another
 * script block of a component may declare `Boolean`.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Expression of the runtime tree.
 * @returns The name as written, or null when the value is used otherwise.
 */
export function getTruthOnlyName(
  program: AnalyzedProgram,
  node: Node,
): string | null {
  let { scopes, tree } = program
  let { parent, key } = getContextSlot(tree, node)
  if (
    key !== 'init' ||
    parent?.type !== 'VariableDeclarator' ||
    parent.id.type !== 'Identifier'
  ) {
    return null
  }
  let binding = scopes.bindings.get(parent.id)!
  return (
      binding.references.length > 0 &&
        getClosedInitializer(program, binding, isTruthTest) !== null
    ) ?
      parent.id.name
    : null
}
