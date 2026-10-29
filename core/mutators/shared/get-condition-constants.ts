import type { Node } from 'oxc-parser'

import type { Replacement } from '../../../types/mutator/replacement'
import type { NullishDirection } from './get-nullish-directions'
import type { SkipNote } from '../../../types/mutant/skip-note'
import type { ComparisonPlan } from './get-comparison-plan'
import type { RunContext } from './create-run-context'

import { isNoOpCallbackConstant } from './is-no-op-callback-constant'
import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { getNullishDirections } from './get-nullish-directions'
import { getNextLiteralValue } from './get-next-literal-value'
import { getLoopRunningSkip } from './get-loop-running-skip'
import { NO_OP_CALLBACK_SKIP } from './no-op-callback-skip'
import { getComparisonPlan } from './get-comparison-plan'
import { getLiteralMutator } from './get-literal-mutator'
import { getOwnedConstants } from './get-owned-constants'
import { getLeaveNowValue } from './get-leave-now-value'
import { isAlwaysNullish } from './is-always-nullish'
import { getRunningValue } from './get-running-value'
import { getLiteralValue } from './get-literal-value'
import { getLiteralSkip } from './get-literal-skip'
import { isAlwaysTruthy } from './is-always-truthy'
import { LEAVE_NOW_SKIP } from './leave-now-skip'
import { getInnermost } from './get-innermost'
import { isComparison } from './is-comparison'
import { isNegation } from './is-negation'
import { isAndOr } from './is-and-or'

/**
 * Constants condition emits on a node, and those it skips.
 */
export interface ConditionConstants {
  /**
   * Constants of the node that are not emitted, as replacements with the rule
   * that skips each, `true` first.
   */
  skipped: Replacement[]

  /**
   * Constants that are emitted, `true` first.
   */
  values: boolean[]
}

/**
 * What decides whether a constant of condition's replaced node is skipped.
 */
interface ConstantFacts {
  /**
   * Values toward which a running directional mutant of a `??` test moves the
   * node, with that mutant.
   */
  subsumed: readonly NullishDirection[]

  /**
   * Value of the node that keeps a loop running, unless timeouts are allowed.
   */
  running: undefined | boolean

  /**
   * Value that makes a first exit test leave its loop at once, or null.
   */
  leaveNow: boolean | null

  /**
   * Value the type hints give the node, or null.
   */
  fixed: boolean | null

  /**
   * Tells whether the constant makes a no-op callback.
   */
  noOp(): boolean
}

/**
 * Plans the constants condition emits on a node (catalog 4.7): the node must be
 * condition's replaced node, a test without parentheses or a value negation
 * (the top of a `!` chain that is not a test and not an operand of `&&` or
 * `||`), and its innermost node must not be a `&&` or `||` or a literal, which
 * other mutators own. A comparison keeps a constant only when
 * comparison-operator neither emits it nor will run a mutant that subsumes it
 * (see `getComparisonConstantSkip`). `true` and `false` are then emitted except
 * the constant the types already give, the loop's running value, a constant
 * that a running directional mutant of a `??` test subsumes, the leave-now
 * constant of a first exit test, and a constant that makes a no-op callback.
 * The constants that are not emitted on such a node are returned with their
 * rule, and so are the constants of the top of a `!` chain that is an operand
 * of `&&` or `||` which logical-operator owns (O3); its other constants are not
 * candidates. The plan is pure: the redundancy and ownership rules read it
 * without running condition.
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns The constants condition emits on the node, and the skipped ones;
 *   none when the node is not condition's replaced node.
 */
export function getConditionConstants(
  node: Node,
  context: RunContext,
): ConditionConstants {
  let { parent } = context.syntax.getContextSlot(node)
  let isTest =
    context.syntax.isConditionTest(node) || context.syntax.isLoopTest(node)
  let isTop = isNegation(node) && !isNegation(parent)
  let plan: ConditionConstants = { skipped: [], values: [] }
  if (!isTest && isTop && isAndOr(parent)) {
    let owned = getOwnedConstants(node, context)
    for (let value of [true, false]) {
      let note = owned.get(value)
      if (note) {
        plan.skipped.push({ text: String(value), skip: note, node })
      }
    }
    return plan
  }
  let isTarget =
    isTest ? unwrapParentheses((parent as { test: Node }).test) === node : isTop
  if (!isTarget) {
    return plan
  }
  let { node: inner, negations } = getInnermost(node)
  let negated = negations % 2 === 1
  let comparison =
    isComparison(inner) ? getComparisonPlan(inner, context) : null
  if (isAndOr(inner)) {
    let note: SkipNote = {
      reason: 'logical-operator owns the constants of a && or || group',
      by: { mutator: 'logical-operator', node: inner },
      rule: 'O1',
    }
    plan.skipped.push(
      { text: 'true', skip: note, node },
      { text: 'false', skip: note, node },
    )
    return plan
  }
  if (inner.type === 'Literal' || getLiteralValue(inner) !== null) {
    for (let value of [true, false]) {
      plan.skipped.push({
        skip: getLiteralConstantSkip(
          inner,
          { truth: value !== negated, isTest },
          context,
        ),
        text: String(value),
        node,
      })
    }
    return plan
  }
  let type = context.hints.getType(inner)
  let fixed: boolean | null = null
  if (isAlwaysTruthy(type)) {
    fixed = !negated
  } else if (isAlwaysNullish(type)) {
    fixed = negated
  }
  let running =
    context.settings.timeouts ? null : getRunningValue(node, context)
  let subsumed =
    inner.type === 'LogicalExpression' ?
      getNullishDirections(inner, { mutator: 'condition', node }, context).map(
        direction => ({ ...direction, value: direction.value !== negated }),
      )
    : []
  let leaveNow = getLeaveNowValue(node, context)
  for (let value of [true, false]) {
    let note =
      (comparison &&
        getComparisonConstantSkip(
          inner,
          { truth: value !== negated, plan: comparison, node },
          context,
        )) ??
      getConstantSkip(value, {
        noOp: () => isNoOpCallbackConstant(node, value, context),
        running: running?.value,
        subsumed,
        leaveNow,
        fixed,
      })
    if (note) {
      plan.skipped.push({ text: String(value), skip: note, node })
    } else {
      plan.values.push(value)
    }
  }
  return plan
}

/**
 * Finds why a constant of condition's replaced node is skipped when its
 * innermost node is a literal (catalog 4.7, O1 and O7): the constant that keeps
 * the literal's truth value changes nothing, the other one is the literal
 * mutator's when it emits a mutant that changes the truth value, and otherwise
 * has the skip of that mutant or no owner at all.
 *
 * @param literal - Innermost literal of the node.
 * @param query - Truth value the constant gives the literal, and whether the
 *   node is a test.
 * @param query.truth - Truth value the constant gives the literal.
 * @param query.isTest - Whether the node is a test.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns Rule and reason of the skip.
 */
function getLiteralConstantSkip(
  literal: Node,
  { isTest, truth }: { isTest: boolean; truth: boolean },
  context: RunContext,
): SkipNote {
  let value = getLiteralValue(literal)
  let current = value === null ? 'regex' in literal : Boolean(value)
  if (truth === current) {
    return {
      reason: 'the literal already gives the node this truth value',
      rule: 'literal-truth',
    }
  }
  let next = value === null ? null : getNextLiteralValue(value)
  if (next === null || Boolean(next) !== truth) {
    return {
      reason:
        'the literal is a constant written on purpose, and no literal mutator changes its truth value',
      rule: 'constant-test',
    }
  }
  return (
    getLiteralSkip(literal, { change: { value: next } }, context) ?? {
      by: { mutator: getLiteralMutator(literal)!, node: literal },
      reason: 'a literal belongs to its literal mutator',
      rule: isTest ? 'O7' : 'O1',
    }
  )
}

/**
 * Finds why a constant of condition's replaced node is skipped when its
 * innermost node is a comparison (catalog 4.7): comparison-operator emits the
 * same constant (O1), or, while comparison-operator will run on the comparison,
 * a swap or shifted literal that gives the comparison this value on part of the
 * inputs where the constant does, so a test that kills it kills the constant
 * too (comparison-region). Otherwise the constant keeps the skip that
 * comparison-operator's plan gives a constant of its value, if any.
 *
 * @param comparison - Innermost comparison of the node.
 * @param query - Truth value the constant gives the comparison, the plan of
 *   comparison-operator for it, and the node the constant replaces.
 * @param query.truth - Truth value the constant gives the comparison.
 * @param query.plan - Plan of comparison-operator for the comparison.
 * @param query.node - Node the constant replaces.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns Rule and reason of the skip, or null when the plan gives none.
 */
function getComparisonConstantSkip(
  comparison: Node,
  { truth, plan, node }: { plan: ComparisonPlan; truth: boolean; node: Node },
  context: RunContext,
): SkipNote | null {
  let by = { mutator: 'comparison-operator', node: comparison }
  if (
    plan.entries.some(
      entry => entry.kind === 'constant' && entry.value === truth,
    )
  ) {
    return {
      reason: 'comparison-operator emits the same constant',
      rule: 'O1',
      by,
    }
  }
  if (
    plan.entries.some(entry => entry.value === truth) &&
    context.runs(by, { mutator: 'condition', node })
  ) {
    return {
      reason: `a comparison-operator mutant makes the comparison ${truth} on part of the inputs where the constant does`,
      rule: 'comparison-region',
      by,
    }
  }
  return plan.skippedConstants.get(truth) ?? null
}

/**
 * Finds the first rule that skips a constant of condition's replaced node.
 *
 * @param value - Truth value written in place of the node.
 * @param facts - Values the rules compare the constant with.
 * @returns Rule and reason of the skip, or null when the constant is emitted.
 */
function getConstantSkip(
  value: boolean,
  facts: ConstantFacts,
): SkipNote | null {
  if (value === facts.fixed) {
    return {
      reason: `the type hints make the condition always ${value}`,
      rule: 'typed-constant',
    }
  }
  if (value === facts.running) {
    return getLoopRunningSkip(value)
  }
  if (value === facts.leaveNow) {
    return LEAVE_NOW_SKIP
  }
  let direction = facts.subsumed.find(item => item.value === value)
  if (direction) {
    return {
      reason: `a running mutant of the ?? test moves it toward ${value}`,
      by: direction.by,
      rule: 'R3',
    }
  }
  if (facts.noOp()) {
    return NO_OP_CALLBACK_SKIP
  }
  return null
}
