import type { LogicalExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'
import type { SkipNote } from '../../../types/mutant/skip-note'

import { isConstantEligibleGroup } from './is-constant-eligible-group'
import { isBooleanValued } from './is-boolean-valued'
import { getNegationTop } from './get-negation-top'
import { isBooleanMode } from './is-boolean-mode'
import { isAndOr } from './is-and-or'

/**
 * Finds the constants of a node that logical-operator owns (catalog 4.6, rule
 * 2, O3): both in a boolean-mode operand, an operand of a `&&` or `||` in
 * boolean mode through the `!` chain above it; in value mode, the constant that
 * forces the left operand of a `&&` or `||` to its identity, and the constant
 * that makes a constant-eligible group take its absorbing value while every
 * earlier operand is boolean-valued.
 *
 * @param node - Node a constant replaces, such as a comparison or the top of a
 *   `!` chain.
 * @param context - Mutator context of the file.
 * @returns The skip of each owned constant.
 */
export function getOwnedConstants(
  node: Node,
  context: MutatorContext,
): Map<boolean, SkipNote> {
  let { sourceCode, syntax } = context
  let top = getNegationTop(node, context)
  let negated = top.negations % 2 === 1
  let { parent, key } = syntax.getContextSlot(top.node)
  let owned = new Map<boolean, SkipNote>()
  if (!isAndOr(parent)) {
    return owned
  }
  if (isBooleanMode(parent, context)) {
    for (let value of [true, false]) {
      owned.set(value, {
        reason:
          'logical-operator owns the truth value of a boolean-mode operand',
        by: { mutator: 'logical-operator', node: parent },
        rule: 'O3',
      })
    }
    return owned
  }
  let root: LogicalExpression = parent
  let rootParent = sourceCode.getSlot(root).parent
  while (
    rootParent?.type === 'LogicalExpression' &&
    rootParent.operator === parent.operator
  ) {
    root = rootParent
    rootParent = sourceCode.getSlot(root).parent
  }
  let earlier = syntax
    .getLogicalChain(root)
    .filter(operand => operand.end <= top.node.start)
  if (
    isConstantEligibleGroup(root, context) &&
    earlier.every(operand => isBooleanValued(operand, context))
  ) {
    owned.set((parent.operator === '||') !== negated, {
      reason: `it gives the group its absorbing value, which is logical-operator's constant of the group`,
      by: { mutator: 'logical-operator', node: root },
      rule: 'O3',
    })
  }
  if (key === 'left') {
    owned.set((parent.operator === '&&') !== negated, {
      reason: `it forces the left operand of ${parent.operator} to its identity, which is logical-operator's drop of that operand`,
      by: { mutator: 'logical-operator', node: parent },
      rule: 'O3',
    })
  }
  return owned
}
