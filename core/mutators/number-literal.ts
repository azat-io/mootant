import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator-context'
import type { Replacement } from '../../types/replacement'
import type { Mutator } from '../../types/mutator'

import { isNoOpCallbackLiteral } from './shared/is-no-op-callback-literal'
import { isBooleanModeOperand } from './shared/is-boolean-mode-operand'
import { isBranchCopySkipped } from './shared/is-branch-copy-skipped'
import { isComparisonOperand } from './shared/is-comparison-operand'
import { isOrDefaultSkipped } from './shared/is-or-default-skipped'
import { getCallbackOwner } from './shared/get-callback-owner'
import { createRunContext } from './shared/create-run-context'
import { getRunningValue } from './shared/get-running-value'
import { getLiteralValue } from './shared/get-literal-value'
import { getNumberText } from './shared/get-number-text'
import { isVoidOperand } from './shared/is-void-operand'
import { getCalleeName } from '../tree/get-callee-name'
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
 * Callee names whose second argument is a timer delay.
 */
let timerNames = new Set(['setInterval', 'setTimeout'])

/**
 * Methods whose call with the first argument `0` returns the receiver
 * unchanged.
 */
let identityMethods = new Set(['substr', 'slice'])

/**
 * Adds one to a numeric constant (catalog 4.11). A number or BigInt literal, or
 * `-` applied directly to one, gets its value plus one (T7). Comparison
 * operands, boolean-mode operands, `void` operands, keys, timer delays and
 * (unless the `caseTests` option is set) case labels are skipped, and so are
 * changes that keep the truth value in a boolean context, that only a timeout
 * can kill, that keep the sign of a sort comparator's result, or that another
 * mutant owns or subsumes (branch pairs, no-op callbacks, emptied `||`
 * defaults, `slice(-1)`).
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
 * Builds the mutant of a numeric constant, or nothing when a rule of catalog
 * 4.11 skips it.
 *
 * @param node - Number or BigInt literal, or `-` applied directly to one.
 * @param context - Mutator context of the file.
 * @returns The mutant, or nothing.
 */
function mutateNumber(
  node: Node,
  context: MutatorContext<NumberLiteralOptions>,
): Replacement[] {
  let { settings, options, syntax } = context
  let runContext = createRunContext(context)
  let value = getLiteralValue(node) as bigint | number
  let next: bigint | number
  if (typeof value === 'bigint') {
    next = value + 1n
  } else {
    next = value + 1
  }
  let text = getNumberText(node, 1)
  let { parent, index, key } = syntax.getContextSlot(node)
  if (
    text === null ||
    key === 'key' ||
    (parent?.type === 'SwitchCase' && !options.caseTests) ||
    (index === 1 &&
      parent?.type === 'CallExpression' &&
      timerNames.has(getCalleeName(parent.callee) ?? '')) ||
    isComparisonOperand(node, context) ||
    isBooleanModeOperand(node, context) ||
    isVoidOperand(node, context)
  ) {
    return []
  }
  if (
    (syntax.isBooleanContext(node) && Boolean(value) === Boolean(next)) ||
    (!settings.timeouts &&
      getRunningValue(node, context)?.value === Boolean(next)) ||
    (getSign(value) === getSign(next) && isComparatorResult(node, context)) ||
    (next === 0 && isIdentityArgument(node, context)) ||
    isBranchCopySkipped(node, { value: next }, runContext) ||
    isNoOpCallbackLiteral(node, next, context) ||
    isOrDefaultSkipped(node, next, runContext)
  ) {
    return []
  }
  return [{ text, node }]
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
  if (rest.length > 0 || (end && !isUndefined(end, context))) {
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
 * Tells whether a node is a result of a sort comparator that method-call can
 * remove (catalog 4.11, EQ): its concise body, the argument of one of its
 * `return` statements, or a branch of a conditional expression that is one.
 * Only the sign of a comparator's result matters.
 *
 * @param node - Numeric constant.
 * @param context - Mutator context of the file.
 * @returns Whether the node is a result of a no-op callback's comparator.
 */
function isComparatorResult(node: Node, context: MutatorContext): boolean {
  let { syntax } = context
  let slot = syntax.getContextSlot(node)
  while (slot.parent?.type === 'ConditionalExpression' && slot.key !== 'test') {
    slot = syntax.getContextSlot(slot.parent)
  }
  let { parent, key } = slot
  let callback: Node | null = null
  if (key === 'body' && parent?.type === 'ArrowFunctionExpression') {
    callback = parent
  } else if (parent?.type === 'ReturnStatement') {
    callback = syntax.getEnclosingFunction(parent)
  }
  return callback !== null && getCallbackOwner(callback, context) !== null
}

/**
 * Tells whether an argument is the global `undefined`.
 *
 * @param node - Argument of a call.
 * @param context - Mutator context of the file.
 * @returns Whether the argument is, through parentheses, the identifier
 *   `undefined` that resolves to no same-file binding.
 */
function isUndefined(node: Node, context: MutatorContext): boolean {
  let inner = context.syntax.unwrapParentheses(node)
  return (
    inner.type === 'Identifier' &&
    inner.name === 'undefined' &&
    context.sourceCode.getBinding(inner) === null
  )
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
