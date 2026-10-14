import type { LogicalExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { distinguishesNullishSwap } from './distinguishes-nullish-swap'
import { isTruthFlippingLiteral } from './is-truth-flipping-literal'
import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { isBooleanModeOperand } from './is-boolean-mode-operand'
import { isNullishConstant } from './is-nullish-constant'
import { isAlwaysNullish } from './is-always-nullish'
import { isFalsyConstant } from './is-falsy-constant'
import { getLiteralValue } from './get-literal-value'
import { mayBeNullish } from './may-be-nullish'

/**
 * Mutants that logical-operator emits for a `??`.
 */
export interface NullishPlan {
  /**
   * Whether the default is dropped (the node becomes its left side).
   */
  dropRight: boolean

  /**
   * Whether the left side is dropped (the node becomes its default).
   */
  dropLeft: boolean

  /**
   * Whether `??` is swapped to `||`.
   */
  swap: boolean
}

/**
 * Options of logical-operator that its `??` rules read.
 */
export interface NullishOptions {
  /**
   * When `??` and `||` are swapped.
   */
  nullishSwap: 'distinguishing' | 'always'

  /**
   * Whether a default that is `null`, `undefined` or `void 0` is dropped.
   */
  nullishNormalization: boolean
}

/**
 * Plans the mutants of `L ?? R` (catalog 4.8): the swap to `||` where falsy
 * values differ, the drop of `L` unless the swap subsumes it, and the drop of
 * `R` where `L` may be nullish, which normalizes `undefined` to `null` only
 * with `nullishNormalization`. In a truth position with a literal or falsy
 * default, the drop of `L` and the swap are the position's constants and are
 * skipped, and the drop of `R` stays only for a truthy default that no literal
 * mutator flips. Same-operator groups are flattened. The plan is pure:
 * condition and the polarity rules read it.
 *
 * @param node - `??` expression of the runtime tree.
 * @param context - Mutator context of the file.
 * @param options - Options of logical-operator.
 * @returns Which mutants are emitted.
 */
export function getNullishPlan(
  node: LogicalExpression,
  context: MutatorContext,
  options: NullishOptions,
): NullishPlan {
  let { right, left } = node
  let leftType = context.hints.getType(left)
  if (
    isLiteralDefault(right, context) &&
    (context.syntax.isBooleanContext(node) ||
      isBooleanModeOperand(node, context))
  ) {
    return {
      dropRight:
        mayBeNullish(leftType) &&
        !isFalsyConstant(right, context) &&
        !isTruthFlippingLiteral(right),
      dropLeft: false,
      swap: false,
    }
  }
  let swap = distinguishesNullishSwap(node, context.hints, options.nullishSwap)
  return {
    dropRight:
      !isNullishGroup(right) &&
      mayBeNullish(leftType) &&
      (options.nullishNormalization || !isNullishConstant(right, context)),
    dropLeft: !swap && !isNullishGroup(left) && !isAlwaysNullish(leftType),
    swap,
  }
}

/**
 * Tells whether a default is a literal or another falsy constant.
 *
 * @param node - Right side of `??`.
 * @param context - Mutator context of the file.
 * @returns Whether the default has a constant truth value by its syntax.
 */
function isLiteralDefault(node: Node, context: MutatorContext): boolean {
  return (
    unwrapParentheses(node).type === 'Literal' ||
    getLiteralValue(node) !== null ||
    isFalsyConstant(node, context)
  )
}

/**
 * Tells whether an operand is, through parentheses, another `??`.
 *
 * @param node - Operand of `??`.
 * @returns Whether the group flattens the operand.
 */
function isNullishGroup(node: Node): boolean {
  let inner = unwrapParentheses(node)
  return inner.type === 'LogicalExpression' && inner.operator === '??'
}
