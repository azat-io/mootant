import type { Node } from 'oxc-parser'

import type { SkipNote } from '../../../types/skip-note'
import type { LiteralValue } from './get-literal-value'
import type { RunContext } from './create-run-context'

import { getCanonicalFalsy } from './get-canonical-falsy'
import { getLiteralMutator } from './get-literal-mutator'
import { getLogicalDrops } from './get-logical-drops'
import { isBooleanMode } from './is-boolean-mode'
import { mayBeNullish } from './may-be-nullish'
import { getTypeView } from './get-type-view'

/**
 * Decides whether a literal mutant of the right operand of a value-mode `L ||
 * R` is skipped because it gives `R` the only falsy value of `L`'s type that is
 * not nullish (catalog 5.2 O16 and 5.3 R7). When `L` cannot be nullish the
 * mutant is logical-operator's drop of `R` (ownership, static); otherwise the
 * nullish swap `L ?? R` subsumes it while that swap will run. A skipped mutant
 * comes with its rule.
 *
 * @param node - Literal that a literal mutator would replace.
 * @param value - Value the literal mutator gives it.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns Rule and reason of the skip, or null when the mutant is emitted.
 */
export function getOrDefaultSkip(
  node: Node,
  value: LiteralValue,
  context: RunContext,
): SkipNote | null {
  let { parent, key } = context.syntax.getContextSlot(node)
  if (
    key !== 'right' ||
    parent?.type !== 'LogicalExpression' ||
    parent.operator !== '||' ||
    isBooleanMode(parent, context)
  ) {
    return null
  }
  let leftType = context.hints.getType(parent.left)
  if (getCanonicalFalsy(getTypeView(leftType).type) !== value) {
    return null
  }
  let by = { mutator: 'logical-operator', node: parent }
  if (!mayBeNullish(leftType)) {
    return {
      reason:
        "it gives the default the only falsy value of the left operand's type, which is logical-operator's drop of the default",
      rule: 'O16',
      by,
    }
  }
  return (
      getLogicalDrops(parent, context, 'distinguishing').swap &&
        context.runs(by, { mutator: getLiteralMutator(node)!, node })
    ) ?
      {
        reason:
          "it gives the default the only falsy value of the left operand's type that is not nullish, and the running swap to ?? covers it",
        rule: 'R7',
        by,
      }
    : null
}
