import type { Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { ReadCheck } from '../../types/syntax/read-check'

import { getClosedInitializer } from './get-closed-initializer'
import { getContextSlot } from '../tree/get-context-slot'

/**
 * Finds the name that an expression initializes when its value only reaches
 * reads that pass a check through that name: the expression is, through
 * parentheses and TypeScript wrappers, the initializer that always gives the
 * name its value; the program holds every read of the name; and the name is
 * read at least once, every read being a node of the runtime tree that passes
 * the check (see `getClosedInitializer`). A read outside the runtime tree, such
 * as an `export { x }` specifier, passes the value on.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Expression of the runtime tree.
 * @param check - Check of a read.
 * @returns The name as written, or null when the value is used otherwise.
 */
export function getCheckedName(
  program: AnalyzedProgram,
  node: Node,
  check: ReadCheck,
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
        getClosedInitializer(program, binding, check) !== null
    ) ?
      parent.id.name
    : null
}
