import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { unwrapExpression } from '../../tree/unwrap-expression'
import { getFunctionReturns } from './get-function-returns'
import { isBooleanResult } from './is-boolean-result'

/**
 * Tells whether a node is the initializer, or the right side of an `=` write,
 * of a local that a boolean result of the same function returns (catalog 4.14):
 * the value of that result comes from it, so return-value's constants own its
 * lookup keys too (O8).
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns Whether the node is a source of a boolean result.
 */
export function isBooleanResultSource(
  node: Node,
  context: MutatorContext,
): boolean {
  let { sourceCode, syntax } = context
  let { parent, key } = syntax.getContextSlot(node)
  let target: Node | null = null
  if (key === 'init' && parent?.type === 'VariableDeclarator') {
    target = parent.id
  } else if (
    key === 'right' &&
    parent?.type === 'AssignmentExpression' &&
    parent.operator === '='
  ) {
    target = unwrapExpression(parent.left)
  }
  let binding = target ? sourceCode.getBinding(target) : null
  if (!binding) {
    return false
  }
  let enclosing = syntax.getEnclosingFunction(parent!)
  if (!enclosing) {
    return false
  }
  return getFunctionReturns(enclosing).some(statement => {
    let returned = statement.argument
    return (
      returned !== null &&
      sourceCode.getBinding(unwrapExpression(returned)) === binding &&
      isBooleanResult(returned, context)
    )
  })
}
