import type { Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { ReadCheck } from '../../types/syntax/read-check'

import { getClosedInitializer } from './get-closed-initializer'
import { unwrapExpression } from '../tree/unwrap-expression'

/**
 * Finds the expression whose value an expression always has, through
 * parentheses and TypeScript wrappers: the expression itself or, for a name,
 * the initializer that always gives the name its value when the program holds
 * every read of the name and each read passes a check (see
 * `getClosedInitializer`).
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Expression to resolve.
 * @param isAllowedRead - Check of a read of the name.
 * @returns The expression or the initializer without wrappers, or null for a
 *   name without such an initializer.
 */
export function resolveClosedExpression(
  program: AnalyzedProgram,
  node: Node,
  isAllowedRead: ReadCheck,
): Node | null {
  let current = unwrapExpression(node)
  if (current.type !== 'Identifier') {
    return current
  }
  let binding = program.scopes.bindings.get(current)
  let initializer =
    binding && getClosedInitializer(program, binding, isAllowedRead)
  return initializer ? unwrapExpression(initializer) : null
}
