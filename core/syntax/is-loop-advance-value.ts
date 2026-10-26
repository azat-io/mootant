import type { Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { getFixedInitializer } from './get-fixed-initializer'
import { getContextSlot } from '../tree/get-context-slot'
import { advancesLoop } from './advances-loop'

/**
 * Tells whether a node is, through parentheses and TypeScript expression
 * wrappers, the value that advances a loop: the whole right-hand side of an `=`
 * assignment to a name, or to a destructuring pattern that binds a name, that a
 * loop around the assignment reads to decide whether to go on (`done = true`,
 * `s = s.slice(1)`, `({ done } = await reader.read())`), or the initializer
 * that always gives a variable its value (see `getFixedInitializer`) when the
 * variable is itself the whole right-hand side of such an assignment, as
 * `position + space.length` in `let end = position + space.length` before
 * `position = end`. Replacing such a value can stop the loop from advancing.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Node of the runtime tree.
 * @returns Whether the node is the value that advances a loop.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isLoopAdvanceValue(
  program: AnalyzedProgram,
  node: Node,
): boolean {
  let { shared, scopes, tree } = program
  if (isAdvancingValue(tree, node)) {
    return true
  }
  let { parent, key } = getContextSlot(tree, node)
  if (key !== 'init' || parent?.type !== 'VariableDeclarator') {
    return false
  }
  let binding = scopes.bindings.get(parent.id)
  return (
    binding !== undefined &&
    getFixedInitializer(scopes, shared, binding) === parent.init &&
    binding.references.some(
      reference =>
        tree.slots.has(reference) && isAdvancingValue(tree, reference),
    )
  )
}

/**
 * Tells whether a node is, through parentheses and TypeScript expression
 * wrappers, the whole right-hand side of an `=` assignment that advances a loop
 * (`advancesLoop`).
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether the node is the assigned value.
 */
function isAdvancingValue(tree: TreeIndex, node: Node): boolean {
  let { parent, key } = getContextSlot(tree, node)
  return (
    parent?.type === 'AssignmentExpression' &&
    parent.operator === '=' &&
    key === 'right' &&
    advancesLoop(tree, parent)
  )
}
