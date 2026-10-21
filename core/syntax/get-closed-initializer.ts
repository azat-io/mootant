import type { Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { TreeIndex } from '../../types/syntax/tree-index'
import type { Binding } from '../../types/syntax/binding'

import { getFixedInitializer } from './get-fixed-initializer'
import { getBindingClosure } from './get-binding-closure'

/**
 * Check of one read of a name, given the runtime tree of the program and the
 * identifier of the read.
 */
type ReadCheck = (tree: TreeIndex, reference: Node) => boolean

/**
 * Whether every read of a name is a node of the runtime tree that passes a
 * check, by the check and then by the binding of the name, which belongs to one
 * program and so to one runtime tree.
 */
let checkedReads = new WeakMap<ReadCheck, WeakMap<Binding, boolean>>()

/**
 * Finds the initializer that always gives a name its value (see
 * `getFixedInitializer`) when the program holds every read of the name (see
 * `getBindingClosure`) and each read is a node of the runtime tree that passes
 * a check, such as one that only reads a collection or only runs a regex. The
 * reads of a name are walked once per check, so asking about a name at each of
 * its reads costs one walk in all.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param binding - Binding of the name.
 * @param isAllowedRead - Check of a read.
 * @returns The initializer, or null when the name has none, is not closed or
 *   has a read that is not allowed.
 */
export function getClosedInitializer(
  program: AnalyzedProgram,
  binding: Binding,
  isAllowedRead: ReadCheck,
): Node | null {
  let { shared, scopes, tree } = program
  if (getBindingClosure(scopes, shared, binding) !== 'closed') {
    return null
  }
  let initializer = getFixedInitializer(scopes, shared, binding)
  if (!initializer) {
    return null
  }
  let verdicts = checkedReads.get(isAllowedRead)
  if (!verdicts) {
    verdicts = new WeakMap()
    checkedReads.set(isAllowedRead, verdicts)
  }
  let allowed = verdicts.get(binding)
  if (allowed === undefined) {
    allowed = binding.references.every(
      reference => tree.slots.has(reference) && isAllowedRead(tree, reference),
    )
    verdicts.set(binding, allowed)
  }
  return allowed ? initializer : null
}
