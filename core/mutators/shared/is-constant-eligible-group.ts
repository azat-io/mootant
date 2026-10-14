import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { getLiteralValue } from './get-literal-value'
import { isBooleanMode } from './is-boolean-mode'
import { mayBeBoolean } from './may-be-boolean'
import { getInnermost } from './get-innermost'
import { isAndOr } from './is-and-or'

/**
 * Tells whether a `&&` or `||` group meets the static conditions under which
 * logical-operator may give a returned value-mode group its constant (catalog
 * 4.8, emission 3b): the group is a returned value (the argument of a `return`
 * or a concise arrow body, so a root and not an operand of another `&&` or
 * `||`), in value mode, and every operand may be a boolean and is not, through
 * `!`, a literal. The ownership rule of comparison-operator reads it (4.6, rule
 * 2), whether or not the constant is then emitted.
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns Whether the node is a constant-eligible group.
 */
export function isConstantEligibleGroup(
  node: Node,
  context: MutatorContext,
): boolean {
  if (!isAndOr(node)) {
    return false
  }
  let { syntax, hints } = context
  let { parent, key } = syntax.getContextSlot(node)
  let returned =
    parent?.type === 'ReturnStatement' ||
    (parent?.type === 'ArrowFunctionExpression' && key === 'body')
  return (
    returned &&
    !isBooleanMode(node, context) &&
    syntax
      .getLogicalChain(node)
      .every(
        operand => mayBeBoolean(hints.getType(operand)) && !isLiteral(operand),
      )
  )
}

/**
 * Tells whether an operand is, through wrappers and `!`, a literal.
 *
 * @param node - Operand of a logical group.
 * @returns Whether the innermost node is a Literal, a template without
 *   expressions or a negative number literal.
 */
function isLiteral(node: Node): boolean {
  let inner = getInnermost(node).node
  return inner.type === 'Literal' || getLiteralValue(inner) !== null
}
