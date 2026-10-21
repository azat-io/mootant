import type { LogicalExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'
import type { Replacement } from '../../../types/mutator/replacement'
import type { SkipNote } from '../../../types/mutant/skip-note'

import { distinguishesNullishSwap } from './distinguishes-nullish-swap'
import { isTruthFlippingLiteral } from './is-truth-flipping-literal'
import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { isBooleanModeOperand } from './is-boolean-mode-operand'
import { isNullishConstant } from './is-nullish-constant'
import { getLiteralMutator } from './get-literal-mutator'
import { isAlwaysNullish } from './is-always-nullish'
import { isFalsyConstant } from './is-falsy-constant'
import { getLiteralValue } from './get-literal-value'
import { mayBeNullish } from './may-be-nullish'

/**
 * Mutants that logical-operator emits for a `??`.
 */
export interface NullishPlan {
  /**
   * Mutants that are not emitted, as replacements with the rule that skips
   * each, in emission order. Drops of a nested `??` group are not candidates
   * and are not listed.
   */
  skipped: Replacement[]

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
 * mutator flips. Elsewhere, under every `nullishSwap` mode, the swap is
 * equivalent when `L` is never falsy unless nullish (see `getNeverFalsyFact`),
 * and so are the swap and the drop of `R` when `R` is a falsy literal and the
 * `??` initializes a name that is only read for its truth (see
 * `getTruthOnlyName`); the drop of `L` stays, as no swap subsumes it.
 * Same-operator groups are flattened. Mutants that are not emitted are returned
 * with their rule. The plan is pure: condition and the polarity rules read it.
 *
 * @param node - `??` expression of the runtime tree.
 * @param context - Mutator context of the file.
 * @param options - Options of logical-operator.
 * @returns Which mutants are emitted, and the skipped ones.
 */
export function getNullishPlan(
  node: LogicalExpression,
  context: MutatorContext,
  options: NullishOptions,
): NullishPlan {
  let { sourceCode } = context
  let { right, left } = node
  let leftType = context.hints.getType(left)
  let leftText = sourceCode.getText(left)
  let rightText = sourceCode.getText(right)
  let swapText = sourceCode.replaceOperator(node, '||')
  let plan: NullishPlan = {
    dropRight: false,
    dropLeft: false,
    skipped: [],
    swap: false,
  }

  /**
   * Skips a mutant of the expression.
   *
   * @param text - Text the mutant would write in place of the expression.
   * @param note - Rule and reason of the skip.
   */
  function skip(text: string, note: SkipNote): void {
    plan.skipped.push({ skip: note, node, text })
  }

  let neverNullish: SkipNote = {
    reason:
      'the type hints say the left side is never nullish, so the default never applies',
    rule: 'never-nullish',
  }
  if (
    isLiteralDefault(right, context) &&
    (context.syntax.isBooleanContext(node) ||
      isBooleanModeOperand(node, context))
  ) {
    let position: SkipNote = {
      reason:
        "in a truth position with a literal default it forces the position to a constant, which the position's owner emits",
      rule: 'O15',
    }
    skip(rightText, position)
    skip(
      swapText,
      isFalsyConstant(right, context) ?
        {
          reason:
            'the default is falsy, so in a truth position || and ?? agree',
          rule: 'falsy-default',
        }
      : position,
    )
    if (!mayBeNullish(leftType)) {
      skip(leftText, neverNullish)
    } else if (isFalsyConstant(right, context)) {
      skip(leftText, {
        reason:
          'the default is falsy, so in a truth position dropping it changes nothing',
        rule: 'falsy-default',
      })
    } else if (isTruthFlippingLiteral(right)) {
      let fallback = unwrapParentheses(right)
      skip(leftText, {
        reason:
          "flipping the default's truth value is the same behavior, which its literal mutator owns",
        by: { mutator: getLiteralMutator(fallback)!, node: fallback },
        rule: 'O15',
      })
    } else {
      plan.dropRight = true
    }
    return plan
  }
  let name =
    isFalsyLiteral(right) ? context.syntax.getTruthOnlyName(node) : null
  let readForTruth =
    name === null ? null : (
      `\`${name}\` is only read for its truth and the default is falsy`
    )
  let neverFalsy =
    readForTruth === null ? context.syntax.getNeverFalsyFact(left) : null
  if (readForTruth !== null) {
    skip(swapText, {
      reason: `${readForTruth}, so ?? and || agree`,
      rule: 'falsy-default',
    })
  } else if (neverFalsy === null) {
    plan.swap = distinguishesNullishSwap(
      node,
      context.hints,
      options.nullishSwap,
    )
    if (!plan.swap) {
      skip(swapText, {
        reason:
          '?? and || differ here only on falsy values that the nullishSwap option does not count, such as the default itself',
        rule: 'nullish-swap',
      })
    }
  } else {
    skip(swapText, {
      reason: `the left side is never falsy when defined (${neverFalsy}), so || and ?? agree`,
      rule: 'never-falsy',
    })
  }
  if (!isNullishGroup(left)) {
    if (plan.swap) {
      skip(rightText, {
        reason:
          'the swap to || subsumes dropping the left side: every test that kills the swap also kills the drop',
        by: { mutator: 'logical-operator', node },
        rule: 'swap-subsumes-drop',
      })
    } else if (isAlwaysNullish(leftType)) {
      skip(rightText, {
        reason:
          'the type hints make the left side always nullish, so dropping it changes nothing',
        rule: 'typed-constant',
      })
    } else {
      plan.dropLeft = true
    }
  }
  if (!isNullishGroup(right)) {
    if (!mayBeNullish(leftType)) {
      skip(leftText, neverNullish)
    } else if (
      !options.nullishNormalization &&
      isNullishConstant(right, context)
    ) {
      skip(leftText, {
        reason:
          'dropping a null or undefined default only turns one nullish value into the other (nullishNormalization is off)',
        rule: 'nullish-normalization',
      })
    } else if (readForTruth === null) {
      plan.dropRight = true
    } else {
      skip(leftText, {
        reason: `${readForTruth}, so dropping it changes nothing`,
        rule: 'falsy-default',
      })
    }
  }
  return plan
}

/**
 * Tells whether a default is a falsy literal, whose evaluation does nothing but
 * give its value: `false`, `0`, `-0`, `0n`, `''`, an empty template, `null` or
 * `void` of a literal. The names `undefined` and `NaN` do not count, since
 * another script block of a component may declare them, and neither does `void`
 * of any other expression, which may call a function, read a getter or throw.
 *
 * @param node - Right side of `??`.
 * @returns Whether the default is a falsy literal.
 */
function isFalsyLiteral(node: Node): boolean {
  let value = getLiteralValue(node)
  if (value !== null) {
    return !value
  }
  let inner = unwrapParentheses(node)
  return inner.type === 'UnaryExpression' ?
      inner.operator === 'void' &&
        unwrapParentheses(inner.argument).type === 'Literal'
    : inner.type === 'Literal' && inner.raw === 'null'
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
