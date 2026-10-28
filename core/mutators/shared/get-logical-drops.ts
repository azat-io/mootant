import type { LogicalExpression, Node } from 'oxc-parser'

import type { Replacement } from '../../../types/mutator/replacement'
import type { SkipNote } from '../../../types/mutant/skip-note'
import type { RunContext } from './create-run-context'

import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { hasDefinedFalsyValue } from './has-defined-falsy-value'
import { getNullishSwapSkip } from './get-nullish-swap-skip'
import { isCanonicalFalsy } from './is-canonical-falsy'
import { isBooleanValued } from './is-boolean-valued'
import { isAlwaysNullish } from './is-always-nullish'
import { hasPolarMutant } from './has-polar-mutant'
import { isAlwaysTruthy } from './is-always-truthy'
import { getFixedTruth } from './get-fixed-truth'
import { isBooleanMode } from './is-boolean-mode'
import { mayBeBoolean } from './may-be-boolean'
import { mayBeNullish } from './may-be-nullish'
import { getTypeView } from './get-type-view'

/**
 * Operand drops of a `&&` or `||` that logical-operator emits.
 */
export interface LogicalDrops {
  /**
   * Drops and swaps that are not emitted, as replacements with the rule that
   * skips each, in emission order. Drops of a same-operator group are not
   * candidates and are not listed.
   */
  skipped: Replacement[]

  /**
   * Whether the right operand is dropped (the node becomes its left operand).
   */
  dropRight: boolean

  /**
   * Whether the left operand is dropped (the node becomes its right operand).
   */
  dropLeft: boolean

  /**
   * Whether the nullish swap `L ?? R` replaces the drop of the right operand of
   * a value-mode `||`.
   */
  swap: boolean
}

/**
 * Decides the drops of a `&&` or `||` (catalog 4.8, emissions 1 and 2): each
 * operand is dropped unless it is a same-operator group, the drop is equivalent
 * by the types or by fixed operands, or the polarity rule finds a running
 * mutant that subsumes it. In value mode a `||` whose left side may be nullish
 * gets the nullish swap instead of the drop of its right operand when `??` and
 * `||` differ, which they never do, under every `nullishSwap` mode, when the
 * left side is never falsy unless nullish (see `getNeverFalsyFact`). Drops and
 * swaps that are not emitted are returned with their rule. The plan is pure:
 * the polarity rule of other mutators reads it without running
 * logical-operator.
 *
 * @param node - `&&` or `||` expression of the runtime tree.
 * @param context - Mutator context with the test of mutants that will run.
 * @param nullishSwap - The `nullishSwap` option of logical-operator.
 * @returns Which drops and whether the swap are emitted, and the skipped ones.
 */
export function getLogicalDrops(
  node: LogicalExpression,
  context: RunContext,
  nullishSwap: 'distinguishing' | 'always',
): LogicalDrops {
  let { sourceCode, hints } = context
  let { operator, right, left } = node
  let identity = operator === '&&'
  let booleanMode = isBooleanMode(node, context)
  let fixedApplies =
    context.syntax.isBooleanContext(node) ||
    (isBooleanValued(left, context) && isBooleanValued(right, context))
  let fixedLeft = fixedApplies ? getFixedTruth(left, context) : null
  let fixedRight = fixedApplies ? getFixedTruth(right, context) : null
  let leftType = hints.getType(left)
  let keepsFalsyDefault =
    hasDefinedFalsyValue(leftType) &&
    !mayBeNullish(leftType) &&
    isCanonicalFalsy(getTypeView(leftType).type, right)
  let candidate = { mutator: 'logical-operator', node }
  let skipped: Replacement[] = []
  let identityName = identity ? 'truthy' : 'falsy'
  let absorbingName = identity ? 'falsy' : 'truthy'
  let falsyDefaultNote: SkipNote = {
    reason:
      "the right operand is the only falsy value of the left operand's type, so the result is the same",
    rule: 'canonical-falsy-default',
  }

  /**
   * Finds why the left operand is not dropped.
   *
   * @returns Rule and reason of the skip, or null when the drop is emitted.
   */
  function getDropLeftSkip(): SkipNote | null {
    if (fixedLeft === identity) {
      return {
        reason: `the left operand is always ${identityName}, so dropping it changes nothing`,
        rule: 'fixed-operand',
      }
    }
    if (fixedRight === !identity) {
      return {
        reason: `the right operand is always ${absorbingName}, so the result is the same without the left operand`,
        rule: 'fixed-operand',
      }
    }
    if (identity ? isAlwaysTruthy(leftType) : isAlwaysNullish(leftType)) {
      return {
        reason: `the type hints make the left operand always ${identity ? 'truthy' : 'nullish'}, so dropping it changes nothing`,
        rule: 'typed-constant',
      }
    }
    if (identity && keepsFalsyDefault) {
      return falsyDefaultNote
    }
    if (
      hasPolarMutant({ value: identity, decision: left, candidate }, context)
    ) {
      return {
        reason:
          'a running mutant inside the left operand moves it only toward the value this drop forces',
        rule: 'R2',
      }
    }
    return null
  }

  /**
   * Finds why the right operand is not kept as a candidate for its drop.
   *
   * @returns Rule and reason of the skip, or null when the right operand may be
   *   dropped.
   */
  function getRightKeptSkip(): SkipNote | null {
    if (fixedRight === identity) {
      return {
        reason: `the right operand is always ${identityName}, so dropping it changes nothing`,
        rule: 'fixed-operand',
      }
    }
    if (fixedLeft === !identity) {
      return {
        reason: `the left operand is always ${absorbingName}, so the right operand never decides the result`,
        rule: 'fixed-operand',
      }
    }
    if (identity ? isAlwaysNullish(leftType) : isAlwaysTruthy(leftType)) {
      return {
        reason: `the type hints make the left operand always ${identity ? 'nullish' : 'truthy'}, so the right operand never decides the result`,
        rule: 'typed-constant',
      }
    }
    if (!identity && keepsFalsyDefault) {
      return falsyDefaultNote
    }
    return null
  }

  let dropLeft = false
  if (!isSameOperator(left, operator)) {
    let note = getDropLeftSkip()
    dropLeft = note === null
    if (note) {
      skipped.push({ text: sourceCode.getText(right), skip: note, node })
    }
  }

  let rightKept = false
  if (!isSameOperator(right, operator)) {
    let note = getRightKeptSkip()
    rightKept = note === null
    if (note) {
      skipped.push({ text: sourceCode.getText(left), skip: note, node })
    }
  }
  let swapApplies =
    rightKept &&
    !identity &&
    !booleanMode &&
    mayBeNullish(leftType) &&
    unwrapParentheses(left).type !== 'LogicalExpression'
  let swapSkip =
    swapApplies ? getNullishSwapSkip(node, context, nullishSwap) : null
  let swap = swapApplies && swapSkip === null
  if (swapSkip) {
    skipped.push({
      text: sourceCode.replaceOperator(node, '??'),
      skip: swapSkip,
      node,
    })
  }
  let dropRight = false
  if (swap) {
    skipped.push({
      skip: {
        reason:
          'the swap to ?? replaces this drop: every test that kills the swap also kills the drop',
        by: { mutator: 'logical-operator', node },
        rule: 'swap-subsumes-drop',
      },
      text: sourceCode.getText(left),
      node,
    })
  } else if (rightKept) {
    dropRight =
      !hasPolarMutant(
        { value: identity, decision: right, candidate },
        context,
      ) &&
      (booleanMode ||
        mayBeBoolean(hints.getType(right)) ||
        !hasPolarMutant(
          { value: !identity, decision: left, candidate },
          context,
          true,
        ))
    if (!dropRight) {
      skipped.push({
        skip: {
          reason:
            'a running mutant inside the expression moves it only toward the value this drop forces',
          rule: 'R2',
        },
        text: sourceCode.getText(left),
        node,
      })
    }
  }
  return { dropRight, dropLeft, skipped, swap }
}

/**
 * Tells whether an operand is, through parentheses, a logical expression with
 * the same operator, which the group flattens.
 *
 * @param node - Operand.
 * @param operator - Operator of the parent.
 * @returns Whether dropping the operand would drop a same-operator group.
 */
function isSameOperator(node: Node, operator: string): boolean {
  let inner = unwrapParentheses(node)
  return inner.type === 'LogicalExpression' && inner.operator === operator
}
