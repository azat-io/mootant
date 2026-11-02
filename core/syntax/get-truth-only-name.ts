import type { Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'

import { getCheckedName } from './get-checked-name'
import { isTruthTest } from './is-truth-test'

/**
 * Finds the name that an expression initializes when its value only reaches
 * truth positions through that name (catalog 4.8, N3): every read of the name
 * is one whose truth alone is tested (see `getCheckedName` and `isTruthTest`).
 * The result of a predicate callback and the argument of `Boolean` do not
 * count: only a method name marks the callback, and another script block of a
 * component may declare `Boolean`.
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
  return getCheckedName(program, node, isTruthTest)
}
