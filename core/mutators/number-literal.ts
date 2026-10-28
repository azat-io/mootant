import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { Replacement } from '../../types/mutator/replacement'
import type { SkipNote } from '../../types/mutant/skip-note'
import type { Mutator } from '../../types/mutator/mutator'

import { isGlobalIdentifier } from './shared/is-global-identifier'
import { isComparatorResult } from './shared/is-comparator-result'
import { createRunContext } from './shared/create-run-context'
import { getLiteralValue } from './shared/get-literal-value'
import { getLiteralSkip } from './shared/get-literal-skip'
import { getNumberText } from './shared/get-number-text'
import { getTypeView } from './shared/get-type-view'

/**
 * Options of the number-literal mutator.
 */
interface NumberLiteralOptions {
  /**
   * Whether numbers in `case` labels are mutated.
   */
  caseTests: boolean
}

/**
 * Methods whose call with the first argument `0` returns the receiver
 * unchanged.
 */
let identityMethods = new Set(['substr', 'slice'])

/**
 * Adds one to a numeric constant (catalog 4.11). A number or BigInt literal, or
 * `-` applied directly to one, gets its value plus one (T7). Comparison
 * operands, boolean-mode operands, `void` operands, keys and (unless the
 * `caseTests` option is set) case labels are skipped, and so are changes that
 * keep the truth value in a boolean context, that only a timeout can kill, that
 * keep the sign of a sort comparator's result, or that another mutant owns or
 * subsumes (branch pairs, no-op callbacks, emptied `||` defaults, `slice(-1)`).
 * A skipped change follows as a skipped replacement. Timer delays are skipped
 * for every mutator when the candidates are collected.
 */
export let numberLiteral: Mutator<NumberLiteralOptions> = {
  create(context) {
    return {
      Literal(node, parent) {
        if (
          (typeof node.value !== 'number' && typeof node.value !== 'bigint') ||
          (parent?.type === 'UnaryExpression' &&
            parent.operator === '-' &&
            parent.argument === node)
        ) {
          return []
        }
        return mutateNumber(node, context)
      },
      UnaryExpression(node) {
        let value = getLiteralValue(node)
        if (typeof value !== 'number' && typeof value !== 'bigint') {
          return []
        }
        return mutateNumber(node, context)
      },
    }
  },
  meta: {
    description: 'Adds one to a numeric constant.',
    defaultOptions: { caseTests: false },
  },
}

/**
 * Decides whether number-literal skips the change of a numeric constant
 * (catalog 4.11): keys, case labels unless the `caseTests` option is set, the
 * rules all literal mutators share, and a change that keeps the truth value in
 * a boolean context, that keeps the sign of a sort comparator's result or that
 * makes `slice(-1)` the removed call (O18).
 *
 * @param node - Number or BigInt literal, or `-` applied directly to one.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null when the mutant is emitted.
 */
function getNumberSkip(
  node: Node,
  context: MutatorContext<NumberLiteralOptions>,
): SkipNote | null {
  let { options, syntax } = context
  let value = getLiteralValue(node) as bigint | number
  let next: bigint | number
  if (typeof value === 'bigint') {
    next = value + 1n
  } else {
    next = value + 1
  }
  let { parent, key } = syntax.getContextSlot(node)
  if (key === 'key') {
    return { reason: 'property keys are not mutated', rule: 'property-key' }
  }
  if (parent?.type === 'SwitchCase' && !options.caseTests) {
    return {
      reason: 'case labels are mutated only with the caseTests option',
      rule: 'case-label',
    }
  }
  /**
   * Skips a change that keeps the truth value in a boolean context, that keeps
   * the sign of a sort comparator's result, or that makes `slice(-1)` the
   * removed call (O18).
   *
   * @returns Rule and reason of the skip, or null.
   */
  function getOwnSkip(): SkipNote | null {
    if (syntax.isBooleanContext(node) && Boolean(value) === Boolean(next)) {
      return {
        reason: 'the new value has the same truth value in a boolean context',
        rule: 'same-truth',
      }
    }
    if (getSign(value) === getSign(next) && isComparatorResult(node, context)) {
      return {
        reason: 'only the sign of a sort comparator result matters',
        rule: 'comparator-sign',
      }
    }
    if (next === 0 && isIdentityArgument(node, context)) {
      return {
        reason:
          "the call with the argument 0 returns its receiver, which is method-call's removal of the call",
        by: { mutator: 'method-call', node: parent! },
        rule: 'O18',
      }
    }
    return null
  }
  return getLiteralSkip(
    node,
    { change: { value: next }, getOwnSkip },
    createRunContext(context),
  )
}

/**
 * Tells whether a node is the first argument of a `slice` or `substr` call that
 * returns its receiver unchanged once the argument is `0` (catalog 4.11 and
 * 5.2, O18): the only argument, or followed by `undefined`, on a receiver of
 * type `string`, `array` (for `slice`) or unknown. Turning `slice(-1)` into
 * `slice(0)` is method-call's removal of the call.
 *
 * @param node - Numeric constant.
 * @param context - Mutator context of the file.
 * @returns Whether the constant is the start of an identity call.
 */
function isIdentityArgument(node: Node, context: MutatorContext): boolean {
  let { syntax, hints } = context
  let { parent, index } = syntax.getContextSlot(node)
  if (
    index !== 0 ||
    parent?.type !== 'CallExpression' ||
    parent.callee.type !== 'MemberExpression' ||
    parent.callee.computed ||
    parent.callee.object.type === 'Super' ||
    parent.callee.property.type !== 'Identifier' ||
    !identityMethods.has(parent.callee.property.name)
  ) {
    return false
  }
  let [, end, ...rest] = parent.arguments
  if (
    rest.length > 0 ||
    (end &&
      !isGlobalIdentifier(syntax.unwrapParentheses(end), 'undefined', context))
  ) {
    return false
  }
  let { type } = getTypeView(hints.getType(parent.callee.object))
  return (
    type === 'unknown' ||
    type === 'string' ||
    (type === 'array' && parent.callee.property.name === 'slice')
  )
}

/**
 * Builds the mutant of a numeric constant, skipped when a rule of catalog 4.11
 * applies.
 *
 * @param node - Number or BigInt literal, or `-` applied directly to one.
 * @param context - Mutator context of the file.
 * @returns The mutant or the skipped mutant, or nothing when the new value has
 *   no text.
 */
function mutateNumber(
  node: Node,
  context: MutatorContext<NumberLiteralOptions>,
): Replacement[] {
  let text = getNumberText(node, 1)
  if (text === null) {
    return []
  }
  let skip = getNumberSkip(node, context)
  return [skip ? { text, skip, node } : { text, node }]
}

/**
 * Finds the sign of a number or BigInt.
 *
 * @param value - Number or BigInt.
 * @returns `1`, `-1` or `0`.
 */
function getSign(value: bigint | number): number {
  if (value > 0) {
    return 1
  }
  return value < 0 ? -1 : 0
}
