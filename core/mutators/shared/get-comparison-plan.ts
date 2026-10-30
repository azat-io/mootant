import type {
  AssignmentExpression,
  PrivateInExpression,
  BinaryExpression,
  UpdateExpression,
  Node,
} from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'
import type { Replacement } from '../../../types/mutator/replacement'
import type { ValueBound } from '../../../types/syntax/value-bound'
import type { NodeSlot } from '../../../types/syntax/node-slot'
import type { SkipNote } from '../../../types/mutant/skip-note'
import type { RunningValue } from './get-running-value'

import { getProvenComparisonValue } from './get-proven-comparison-value'
import { isNoOpCallbackConstant } from './is-no-op-callback-constant'
import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { unwrapExpression } from '../../tree/unwrap-expression'
import { getLoopRunningSkip } from './get-loop-running-skip'
import { getMemberPath } from '../../syntax/get-member-path'
import { NO_OP_CALLBACK_SKIP } from './no-op-callback-skip'
import { getOwnedConstants } from './get-owned-constants'
import { getShiftedLiteral } from './get-shifted-literal'
import { getLeaveNowValue } from './get-leave-now-value'
import { getRootName } from '../../syntax/get-root-name'
import { getRunningValue } from './get-running-value'
import { getLiteralValue } from './get-literal-value'
import { isFunction } from '../../syntax/is-function'
import { isNumberLiteral } from './is-number-literal'
import { LEAVE_NOW_SKIP } from './leave-now-skip'
import { isNumericPair } from './is-numeric-pair'
import { getNumberText } from './get-number-text'
import { hasOtherExit } from './has-other-exit'
import { walkTree } from '../../tree/walk-tree'
import { getTypeView } from './get-type-view'

/**
 * Entries comparison-operator emits for a comparison, and those it skips.
 */
export interface ComparisonPlan {
  /**
   * Skips that hold for a constant of each value: the skip of the plan's
   * constant or of the shifted literal that stands for it, the skip of an entry
   * that a lower bound leaves equal to the constant, or the lower bound itself
   * when it makes every input where the constant differs impossible.
   */
  skippedConstants: Map<boolean, SkipNote>

  /**
   * Entries that are emitted, in emission order.
   */
  entries: ComparisonEntry[]

  /**
   * Replacements of the comparison that the context rules skip, each with its
   * rule, in plan order.
   */
  skipped: Replacement[]
}

/**
 * Mutant that comparison-operator emits for a comparison.
 */
interface ComparisonEntry {
  /**
   * Operator swap, shifted literal or constant.
   */
  kind: 'constant' | 'shift' | 'swap'

  /**
   * Region where the mutant differs from the original, or null for the
   * constants of a comparison that is not ordered.
   */
  region: ComparisonRegion | null

  /**
   * Truth value of the comparison under the mutant on the inputs where it
   * differs from the original; for a constant, the constant itself.
   */
  value: boolean

  /**
   * Text that replaces the comparison.
   */
  text: string
}

/**
 * Entry of a plan before its text is built: a new operator or a constant.
 */
interface PlannedEntry {
  /**
   * Region where the entry differs from the original.
   */
  region: ComparisonRegion | null

  /**
   * New operator, or the constant.
   */
  to: boolean | string
}

/**
 * Part of the inputs of a comparison: left operand less than, equal to or
 * greater than the right one.
 */
type ComparisonRegion = 'lt' | 'eq' | 'gt'

/**
 * Plans of relational comparisons.
 */
let orderedPlans = new Map<string, PlannedEntry[]>([
  [
    '<',
    [
      { region: 'eq', to: '<=' },
      { region: 'gt', to: '!=' },
      { region: 'lt', to: false },
    ],
  ],
  [
    '>',
    [
      { region: 'eq', to: '>=' },
      { region: 'lt', to: '!=' },
      { region: 'gt', to: false },
    ],
  ],
  [
    '<=',
    [
      { region: 'eq', to: '<' },
      { region: 'lt', to: '==' },
      { region: 'gt', to: true },
    ],
  ],
  [
    '>=',
    [
      { region: 'eq', to: '>' },
      { region: 'gt', to: '==' },
      { region: 'lt', to: true },
    ],
  ],
])

/**
 * Plan of a numeric `===` or `==`.
 */
let equalPlan: PlannedEntry[] = [
  { region: 'lt', to: '<=' },
  { region: 'gt', to: '>=' },
  { region: 'eq', to: false },
]

/**
 * Plan of a numeric `!==` or `!=`.
 */
let notEqualPlan: PlannedEntry[] = [
  { region: 'gt', to: '<' },
  { region: 'lt', to: '>' },
  { region: 'eq', to: true },
]

/**
 * Plans of numeric equalities, by operator.
 */
let numericPlans = new Map<string, PlannedEntry[]>([
  ['!==', notEqualPlan],
  ['!=', notEqualPlan],
  ['===', equalPlan],
  ['==', equalPlan],
])

/**
 * Plan of a comparison that is not ordered.
 */
let constantPlan: PlannedEntry[] = [
  { region: null, to: true },
  { region: null, to: false },
]

/**
 * Regions where each operator gives true.
 */
let trueRegions = new Map<string, ComparisonRegion[]>([
  ['!==', ['lt', 'gt']],
  ['!=', ['lt', 'gt']],
  ['<=', ['lt', 'eq']],
  ['>=', ['eq', 'gt']],
  ['===', ['eq']],
  ['==', ['eq']],
  ['<', ['lt']],
  ['>', ['gt']],
])

/**
 * Types whose equal values are the same value, up to the sign of a zero.
 */
let primitiveTypes = new Set<string>(['boolean', 'bigint', 'number', 'string'])

/**
 * Region of the other side, for a bounded operand on the right.
 */
let mirroredRegions = new Map<ComparisonRegion, ComparisonRegion>([
  ['lt', 'gt'],
  ['eq', 'eq'],
  ['gt', 'lt'],
])

/**
 * What the skip of an entry that a lower bound leaves constant reads.
 */
interface BoundedSkips {
  /**
   * Winning skip of each constant: the owned one, or the skip by its value.
   */
  constantSkips: ReadonlyMap<boolean, SkipNote>

  /**
   * Skips of the constants by their value.
   */
  valueSkips: ReadonlyMap<boolean, SkipNote>

  /**
   * Bounded operand of the comparison, or null.
   */
  operand: BoundedOperand | null

  /**
   * Whether the bound of the operand rests on the comparison itself, a guard
   * right before a decrement of the operand.
   */
  guard: boolean
}

/**
 * Operand of a comparison with a lower bound that is never nullish, compared
 * with a number literal.
 */
interface BoundedOperand {
  /**
   * Whether the bounded operand is on the right.
   */
  mirrored: boolean

  /**
   * Lower bound of the operand.
   */
  bound: ValueBound

  /**
   * Value of the number literal on the other side.
   */
  limit: number
}

/**
 * Shifted literal of a relational comparison.
 */
interface Shift {
  /**
   * Amount added to the literal.
   */
  step: -1 | 1

  /**
   * Comparison text with the literal moved.
   */
  text: string
}

/**
 * Plans the mutants of a comparison (catalog 4.6): the subsumption-minimal
 * swaps and constant of each operator, the shifted literal in place of the
 * constant of a relational comparison against one number literal, minus the
 * entries that the context rules skip: regions a lower bound makes impossible,
 * constants that logical-operator owns, timeout-only entries in loop
 * conditions, constants proven by `null` or `typeof` comparisons, the equal
 * entry of a min/max idiom, the `!=` or `==` swap of two operands hinted to be
 * objects (it compares references), a first exit test's leave-now constant, and
 * entries that make a no-op callback. A swap or shifted literal that the lower
 * bound leaves constant is skipped like that constant when the constant has a
 * skip by its value, and takes the constant's winning skip: a constant that
 * logical-operator owns wins as it does for the constant itself, unless the
 * bound rests on the comparison, a guard of a decrement of the operand. A skip
 * that rests on the bound names why the bound holds. Skipped entries are
 * returned with the rule that skips them. The plan is pure: other mutators read
 * it without running comparison-operator.
 *
 * @param node - Comparison of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns The entries comparison-operator emits, in emission order, and the
 *   skipped ones.
 */
export function getComparisonPlan(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
): ComparisonPlan {
  let { sourceCode, settings } = context
  let { operator } = node
  let planned = getPlannedEntries(node, context)
  let shift = getShift(node, context)
  let boundedOperand = getBoundedOperand(node, context)
  let impossible = getImpossibleRegions(boundedOperand, 0)
  let running = settings.timeouts ? null : getRunningValue(node, context)
  let valueSkips = getValueSkips(node, context, running)
  let constantSkips = new Map([
    ...valueSkips,
    ...getOwnedConstants(node, context),
  ])
  let operatorSkips = getOperatorSkips(node, context, running)
  let minMax = isMinMaxIdiom(node, context)
  let boundedSkips: BoundedSkips = {
    guard: boundedOperand?.bound.guards?.has(node) ?? false,
    operand: boundedOperand,
    constantSkips,
    valueSkips,
  }

  let entries: ComparisonEntry[] = []
  let skipped: Replacement[] = []
  let skippedConstants = new Map<boolean, SkipNote>()

  /**
   * Skips an entry of the plan.
   *
   * @param text - Text the entry would write in place of the comparison.
   * @param note - Rule and reason of the skip.
   */
  function skip(text: string, note: SkipNote): void {
    skipped.push({ skip: note, node, text })
  }

  for (let { region, to } of planned) {
    let text =
      typeof to === 'boolean' ?
        (shift?.text ?? String(to))
      : sourceCode.replaceOperator(node, to)
    let lowerBoundSkip: SkipNote | null =
      region && impossible.has(region) ?
        {
          reason: `a lower bound of an operand makes the inputs where it differs impossible (${boundedOperand!.bound.because})`,
          rule: 'lower-bound',
        }
      : null
    if (typeof to === 'boolean') {
      let note =
        lowerBoundSkip ??
        (shift ?
          getBoundedSkip(
            boundedSkips,
            getImpossibleRegions(boundedOperand, shift.step),
            operator,
          )
        : constantSkips.get(to))
      if (note) {
        skip(text, note)
        skippedConstants.set(to, note)
      } else {
        entries.push({
          kind: shift ? 'shift' : 'constant',
          value: to,
          region,
          text,
        })
      }
      continue
    }
    let operatorNote =
      lowerBoundSkip ??
      operatorSkips.get(to) ??
      (minMax && region === 'eq' ?
        {
          reason:
            'at equality both branches of the min/max ternary give the same value',
          rule: 'min-max-idiom' as const,
        }
      : null)
    let bounded =
      operatorNote ? null : getBoundedSkip(boundedSkips, impossible, to)
    if (operatorNote ?? bounded) {
      skip(text, (operatorNote ?? bounded)!)
      if (bounded && !skippedConstants.has(getEntryConstant(impossible, to)!)) {
        skippedConstants.set(getEntryConstant(impossible, to)!, bounded)
      }
      continue
    }
    entries.push({
      value: trueRegions.get(to)!.includes(region!),
      kind: 'swap',
      region,
      text,
    })
  }
  for (let value of [true, false]) {
    if (
      !skippedConstants.has(value) &&
      planned.every(
        entry =>
          getPlannedValue(entry) !== value ||
          (entry.region !== null && impossible.has(entry.region)),
      )
    ) {
      skippedConstants.set(value, {
        reason: `a lower bound of an operand makes every input where the comparison is not ${value} impossible (${boundedOperand!.bound.because})`,
        rule: 'lower-bound',
      })
    }
  }
  return { skippedConstants, entries, skipped }
}

/**
 * Finds the swaps of a comparison that are skipped by their operator, with the
 * rule of each: the relational swap that a one-way counter makes equivalent in
 * a loop condition, the `!=` or `==` swap that keeps a loop running, and the
 * `!=` and `==` swaps of a relational comparison of two operands hinted to be
 * objects, which compare references. A loop rule wins over the reference rule.
 *
 * @param node - Comparison.
 * @param context - Mutator context of the file.
 * @param running - Running value of the comparison, or null.
 * @returns The skip of each skipped operator.
 */
function getOperatorSkips(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
  running: RunningValue | null,
): Map<string | null, SkipNote> {
  let operatorSkips = new Map<string | null, SkipNote>([
    [
      getCounterEntry(node, context, running),
      {
        reason:
          'the loop moves the counter one way, keeps the bound and has no other exit, so this form ends the loop at the same point',
        rule: 'one-way-counter',
      },
    ],
  ])
  if (running) {
    operatorSkips.set(running.value ? '!=' : '==', {
      reason:
        'a counter that steps over the bound would keep the loop running, so only a timeout could kill it',
      rule: 'loop-running',
    })
  }
  if (
    orderedPlans.has(node.operator) &&
    getTypeView(context.hints.getType(node.left)).type === 'object' &&
    getTypeView(context.hints.getType(node.right)).type === 'object'
  ) {
    let reference: SkipNote = {
      reason:
        'both operands are objects, so it compares references instead of order',
      rule: 'reference-equality',
    }
    operatorSkips.set('!=', operatorSkips.get('!=') ?? reference)
    operatorSkips.set('==', operatorSkips.get('==') ?? reference)
  }
  return operatorSkips
}

/**
 * Finds the directions in which a loop moves an operand: up for `++` or `+=`
 * with a positive number literal, down for `--` or `-=` with one. Writes are
 * matched by member path, so `this.count++` says nothing about `this.pos`; a
 * write of a prefix of the path, or of a member without a static path on the
 * same root, is a write of another kind, and so is a write by a destructuring
 * pattern, a `for...in` or `for...of` head, `delete` or a declarator (see
 * `isOtherWrite`).
 *
 * @param loop - Loop whose test, update and body are searched, without nested
 *   functions.
 * @param path - Member path of an operand.
 * @returns The direction of each write of the operand, `other` for a write of
 *   another kind; empty when the loop does not write the operand.
 */
function getDirections(
  loop: RunningValue['loop'],
  path: string[],
): Set<string> {
  let directions = new Set<string>()
  let patternProperties = new Set<Node>()
  let parts = [
    loop.test,
    loop.type === 'ForStatement' ? loop.update : null,
    loop.body,
  ]
  for (let part of parts) {
    if (part) {
      walkTree(part, (child, slot) => {
        let direction: string | null = null
        if (
          child.type === 'UpdateExpression' ||
          child.type === 'AssignmentExpression'
        ) {
          direction = getUpdateDirection(child, path)
        } else if (
          isOtherWrite(slot, patternProperties) &&
          getTargetMatch(child, path)
        ) {
          direction = 'other'
        }
        if (direction) {
          directions.add(direction)
        }
        if (child.type === 'ObjectPattern') {
          for (let property of child.properties) {
            patternProperties.add(property)
          }
        }
        return !isFunction(child)
      })
    }
  }
  return directions
}

/**
 * Finds the constants of a comparison that are skipped by their value, with the
 * rule of each: a value the type hints prove, the leave-now constant of a first
 * exit test, the value that keeps a loop running and a constant that makes a
 * no-op callback. The first rule that applies to a value wins.
 *
 * @param node - Comparison.
 * @param context - Mutator context of the file.
 * @param running - Running value of the comparison, or null.
 * @returns The skip of each skipped value.
 */
function getValueSkips(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
  running: RunningValue | null,
): Map<boolean, SkipNote> {
  let proven = getProvenComparisonValue(node, context)
  let leaveNow = getLeaveNowValue(node, context)
  let skips = new Map<boolean, SkipNote>()
  for (let value of [true, false]) {
    let note: SkipNote | null = null
    switch (value) {
      case running?.value: {
        note = getLoopRunningSkip(value)

        break
      }
      case leaveNow: {
        note = LEAVE_NOW_SKIP

        break
      }
      case proven: {
        note = {
          reason: `the type hints prove the comparison is always ${value}`,
          rule: 'proven-comparison',
        }

        break
      }
      default:
        if (isNoOpCallbackConstant(node, value, context)) {
          note = NO_OP_CALLBACK_SKIP
        }
    }
    if (note) {
      skips.set(value, note)
    }
  }
  return skips
}

/**
 * Finds the relational entry that a one-way counter makes equivalent in a loop
 * condition (catalog 4.6, rule 3): for `!==` or `!=` that keeps the loop
 * running, or `===` or `==` that leaves it, when one operand is moved under the
 * loop by updates of one direction only, the loop keeps the other operand (see
 * `isSteady`) and nothing else can end the loop (see `hasOtherExit`), which
 * rules out calls too: a call may throw, or change an operand where the loop
 * does not show it. A counter that starts past the bound or steps over it then
 * keeps the original loop running forever, so the entry differs only on runs
 * that never end.
 *
 * @param node - Comparison.
 * @param context - Mutator context of the file.
 * @param running - Running value of the comparison, or null.
 * @returns The operator of the entry to skip, or null.
 */
function getCounterEntry(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
  running: RunningValue | null,
): string | null {
  let expected = running?.value ? ['!==', '!='] : ['===', '==']
  if (!running || !expected.includes(node.operator)) {
    return null
  }
  let leftDirection = getCounterDirection(running.loop, node.left)
  let direction = leftDirection ?? getCounterDirection(running.loop, node.right)
  if (
    direction === null ||
    !isSteady(running.loop, leftDirection ? node.right : node.left) ||
    hasOtherExit(node, running, context)
  ) {
    return null
  }
  let towardRight = direction === 'up'
  let counterLeft = leftDirection !== null
  if (running.value) {
    return towardRight === counterLeft ? '<' : '>'
  }
  return towardRight === counterLeft ? '>=' : '<='
}

/**
 * Tells whether a relational comparison is the test of a ternary whose branches
 * are its two operands (catalog 4.6, rule 6): at equality both branches give
 * the same value. That holds only for primitives of one kind: both operands
 * must have known types of the same primitive kind, since two equal dates are
 * still two objects and operands of two kinds, or of an unknown kind, can be
 * equal across types (`0 < '0'` returns `'0'`, `0 <= '0'` returns `0`). Numbers
 * keep one difference, the sign of a zero, which only `Object.is` sees
 * (NOISE).
 *
 * @param node - Comparison.
 * @param context - Mutator context of the file.
 * @returns Whether the comparison is a min/max idiom.
 */
function isMinMaxIdiom(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
): boolean {
  let { parent, key } = context.syntax.getContextSlot(node)
  if (
    key !== 'test' ||
    parent?.type !== 'ConditionalExpression' ||
    !orderedPlans.has(node.operator) ||
    !isPlainOperand(node.left) ||
    !isPlainOperand(node.right)
  ) {
    return false
  }
  let [first, second, consequent, alternate] = [
    node.left,
    node.right,
    parent.consequent,
    parent.alternate,
  ].map(part => context.sourceCode.getText(unwrapParentheses(part)))
  return (
    ((first === consequent && second === alternate) ||
      (first === alternate && second === consequent)) &&
    hasPrimitiveOperands(node, context)
  )
}

/**
 * Finds the operand of a comparison that has a lower bound that is never
 * nullish (see `getValueBound`) while the other operand is a number literal, or
 * a BigInt literal unless the comparison is strict: an `undefined` operand
 * makes `!=` true and `>` false, so only such a bound rules inputs out, and a
 * bounded value is a number, which `===` never finds equal to a BigInt. The
 * BigInt must be a safe integer: a number compares with a BigInt exactly, and
 * only a safe integer keeps its value, and that of its shifted literal, as a
 * number.
 *
 * @param node - Comparison.
 * @param context - Mutator context of the file.
 * @returns The bound of the operand, the value of the literal and whether the
 *   bounded operand is on the right, or null.
 */
function getBoundedOperand(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
): BoundedOperand | null {
  let strict = node.operator === '===' || node.operator === '!=='
  for (let [bounded, literal, mirrored] of [
    [node.left, node.right, false],
    [node.right, node.left, true],
  ] as const) {
    let value = getLiteralValue(literal)
    let bound =
      (
        typeof value === 'number' ||
        (typeof value === 'bigint' &&
          !strict &&
          Number.isSafeInteger(Number(value)))
      ) ?
        context.syntax.getValueBound(bounded)
      : null
    if (bound && !bound.nullable) {
      return { limit: Number(value), mirrored, bound }
    }
  }
  return null
}

/**
 * Tells whether a slot holds a node that is written other than by an update or
 * an assignment of its own: a part of a destructuring pattern, the head of a
 * `for...in` or `for...of` loop, the operand of `delete`, or the name of a
 * declarator.
 *
 * @param slot - Raw slot of the node.
 * @param patternProperties - Properties of the object patterns walked so far.
 * @returns Whether the node is written.
 */
function isOtherWrite(
  slot: NodeSlot,
  patternProperties: ReadonlySet<Node>,
): boolean {
  let { parent, key } = slot
  switch (parent?.type) {
    case 'VariableDeclarator':
      return key === 'id'
    case 'AssignmentPattern':
    case 'ForOfStatement':
    case 'ForInStatement':
      return key === 'left'
    case 'UnaryExpression':
      return parent.operator === 'delete'
    case 'ArrayPattern':
    case 'RestElement':
      return true
    case 'Property':
      return key === 'value' && patternProperties.has(parent)
    default:
      return false
  }
}

/**
 * Finds the regions that a lower bound makes impossible (catalog 4.6, rule 1):
 * with one operand bounded below by `L` and the other a number literal `c`,
 * "bounded < c" is impossible when `c <= L`, and "bounded = c" when `c < L`.
 * With a step, the literal is read moved by it, as in the shifted literal.
 *
 * @param operand - Bounded operand of the comparison, or null.
 * @param step - Amount added to the literal: `0`, or the step of the shifted
 *   literal.
 * @returns Impossible regions, named from the left operand.
 */
function getImpossibleRegions(
  operand: BoundedOperand | null,
  step: number,
): Set<ComparisonRegion> {
  let impossible = new Set<ComparisonRegion>()
  if (!operand) {
    return impossible
  }
  let limit = operand.limit + step
  let regions: ComparisonRegion[] = []
  if (limit <= operand.bound.lower) {
    regions.push('lt')
  }
  if (limit < operand.bound.lower) {
    regions.push('eq')
  }
  for (let region of regions) {
    impossible.add(operand.mirrored ? mirroredRegions.get(region)! : region)
  }
  return impossible
}

/**
 * Finds why an entry that the lower bound leaves constant is skipped: the entry
 * is that constant, so when the constant has a skip by its value, the entry
 * takes the winning skip of the constant, and a constant that logical-operator
 * owns wins as it does for the constant itself (O3): the entry is then the
 * program of logical-operator's drop of the operand. The entry is that constant
 * only while the bound holds, so it gets no skip when the bound rests on the
 * comparison itself, a guard right before a decrement of the operand: the entry
 * may let the decrement run where the guard stopped it and take the operand
 * below the bound.
 *
 * @param skips - Skips of the constants by their value, the winning skip of
 *   each constant, the bounded operand of the comparison and whether its bound
 *   rests on the comparison.
 * @param impossible - Regions the lower bound makes impossible for the entry.
 * @param operator - Operator of the entry's comparison.
 * @returns The skip of the constant, reworded for the entry, or null.
 */
function getBoundedSkip(
  skips: BoundedSkips,
  impossible: Set<ComparisonRegion>,
  operator: string,
): SkipNote | null {
  let constant = getEntryConstant(impossible, operator)
  if (constant === null || skips.guard || !skips.valueSkips.has(constant)) {
    return null
  }
  let note = skips.constantSkips.get(constant)!
  return {
    ...note,
    reason: `a lower bound of an operand makes it the constant ${constant} (${skips.operand!.bound.because}), and ${note.reason}`,
    heuristic: true,
  }
}

/**
 * Tells whether an operand keeps its value while a loop runs: a literal, a name
 * or member chain that the loop does not change (see `getDirections`), or a
 * unary or binary operation on such operands. A call may give another value
 * each time, so an operand with one is not steady.
 *
 * @param loop - Loop of the comparison.
 * @param operand - Operand of the comparison.
 * @returns Whether the loop leaves the value of the operand as it is.
 */
function isSteady(loop: RunningValue['loop'], operand: Node): boolean {
  let inner = unwrapExpression(operand)
  while (inner.type === 'UnaryExpression') {
    inner = unwrapExpression(inner.argument)
  }
  let path = getMemberPath(inner)
  if (path) {
    return getDirections(loop, path).size === 0
  }
  switch (inner.type) {
    case 'BinaryExpression':
      return isSteady(loop, inner.left) && isSteady(loop, inner.right)
    case 'Literal':
      return true
    default:
      return false
  }
}

/**
 * Builds the shifted literal of a relational comparison with exactly one number
 * literal operand (see `getShiftedLiteral`).
 *
 * @param node - Comparison.
 * @param context - Mutator context of the file.
 * @returns The comparison text with the literal moved one step and the step, or
 *   null.
 */
function getShift(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
): Shift | null {
  let shifted = getShiftedLiteral(node)
  if (!shifted) {
    return null
  }
  let { literal, step } = shifted
  let text = getNumberText(literal, step)
  return text === null ? null : (
      {
        text: context.sourceCode.editText(node, [
          { start: literal.start, end: literal.end, text },
        ]),
        step,
      }
    )
}

/**
 * Tells how a write target touches an operand, matched by member path.
 *
 * @param target - Target of a write.
 * @param path - Member path of the operand.
 * @returns `same` for the operand itself, `other` for a prefix of its path, a
 *   member without a static path on its root, or a member that changes the
 *   operand through a `length` (see `isLengthPair`), and null when the target
 *   does not touch the operand.
 */
function getTargetMatch(target: Node, path: string[]): 'other' | 'same' | null {
  let targetPath = getMemberPath(target)
  if (targetPath === null) {
    return getRootName(target) === path[0] ? 'other' : null
  }
  if (
    targetPath.length > path.length ||
    targetPath.some((name, index) => name !== path[index])
  ) {
    return isLengthPair(targetPath, path) ? 'other' : null
  }
  return targetPath.length < path.length ? 'other' : 'same'
}

/**
 * Reads the direction in which an update moves an operand, matched by member
 * path (see `getTargetMatch`).
 *
 * @param update - Update or assignment expression.
 * @param path - Member path of the operand.
 * @returns `up` or `down` for an update of the operand itself, `other` for an
 *   assignment of another kind, for an update of a prefix of the operand's path
 *   or of a member without a static path on the operand's root, and null when
 *   the update does not touch the operand.
 */
function getUpdateDirection(
  update: AssignmentExpression | UpdateExpression,
  path: string[],
): string | null {
  let match = getTargetMatch(
    update.type === 'UpdateExpression' ? update.argument : update.left,
    path,
  )
  if (match !== 'same') {
    return match
  }
  if (update.type === 'UpdateExpression') {
    return update.operator === '++' ? 'up' : 'down'
  }
  return getAssignmentDirection(update.operator, update.right)
}

/**
 * Tells whether an operand is an identifier, `this`, a literal, `-` applied to
 * a number literal or a non-computed member chain of them.
 *
 * @param node - Operand, through parentheses.
 * @returns Whether the operand has no effect and one value.
 */
function isPlainOperand(node: Node): boolean {
  let inner = unwrapParentheses(node)
  switch (inner.type) {
    case 'MemberExpression':
      return !inner.computed && isPlainOperand(inner.object)
    case 'UnaryExpression':
      return isNumberLiteral(inner)
    case 'ThisExpression':
    case 'Identifier':
    case 'Literal':
      return true
    default:
      return false
  }
}

/**
 * Picks the plan of a comparison: the plan of a numeric `===`, `==`, `!==` or
 * `!=` when the type hints make one operand numeric and neither operand known
 * to be something else, otherwise the plan of its relational operator or, for
 * any other comparison, its two constants.
 *
 * @param node - Comparison.
 * @param context - Mutator context of the file.
 * @returns The planned entries, in emission order.
 */
function getPlannedEntries(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
): PlannedEntry[] {
  let numeric = numericPlans.get(node.operator)
  if (
    numeric &&
    isNumericPair(
      context.hints.getType(node.left),
      context.hints.getType(node.right),
    )
  ) {
    return numeric
  }
  return orderedPlans.get(node.operator) ?? constantPlan
}

/**
 * Tells whether a write of a member of an object may change an operand through
 * the `length` of that object: an array grows when an element past its end is
 * written, so `list['2'] = 0` changes `list.length`, and drops elements when
 * its `length` is written, so `list.length = 0` changes `list['0']` and
 * everything read through it, such as `list['0'].length`.
 *
 * @param target - Member path of the write.
 * @param path - Member path of the operand, which is not the target and does
 *   not start with it.
 * @returns Whether the operand reads another member of the object whose member
 *   the target is, or something through one, and either the target is the
 *   `length` of the object or the operand is.
 */
function isLengthPair(target: string[], path: string[]): boolean {
  let object = target.slice(0, -1)
  if (
    object.length === 0 ||
    path.length <= object.length ||
    object.some((name, index) => name !== path[index])
  ) {
    return false
  }
  return (
    target.at(-1) === 'length' ||
    (path.length === target.length && path.at(-1) === 'length')
  )
}

/**
 * Finds the value of an entry that the lower bound leaves constant (catalog
 * 4.6, rules 3, 7 and 8): every region the entry's comparison can still take
 * gives it one truth value.
 *
 * @param impossible - Regions the lower bound makes impossible for the entry.
 * @param operator - Operator of the entry's comparison.
 * @returns The constant truth value, or null when the entry is not constant.
 */
function getEntryConstant(
  impossible: Set<ComparisonRegion>,
  operator: string,
): boolean | null {
  let values = new Set(
    (['lt', 'eq', 'gt'] as const)
      .filter(region => !impossible.has(region))
      .map(region => trueRegions.get(operator)!.includes(region)),
  )
  let [only] = values
  return values.size === 1 ? only! : null
}

/**
 * Finds the direction of an operand that a loop moves one way only (see
 * `getDirections`).
 *
 * @param loop - Loop of the comparison.
 * @param operand - Operand of the comparison.
 * @returns `up` or `down` when every update of the operand under the loop moves
 *   it that way, or null when the operand has no member path or the loop does
 *   not change it, or changes it otherwise.
 */
function getCounterDirection(
  loop: RunningValue['loop'],
  operand: Node,
): 'down' | 'up' | null {
  let path = getMemberPath(operand)
  let directions = path ? getDirections(loop, path) : new Set<string>()
  let [only] = directions
  return directions.size === 1 && (only === 'up' || only === 'down') ?
      only
    : null
}

/**
 * Reads the direction of a compound assignment.
 *
 * @param operator - Operator such as `+=`, `-=` or `*=`.
 * @param value - Right side of the assignment.
 * @returns `up` for `+=` and `down` for `-=` with a positive number literal,
 *   `other` otherwise.
 */
function getAssignmentDirection(operator: string, value: Node): string {
  let literal = getLiteralValue(unwrapExpression(value))
  if (typeof literal !== 'number' || literal <= 0) {
    return 'other'
  }
  if (operator === '+=') {
    return 'up'
  }
  return operator === '-=' ? 'down' : 'other'
}

/**
 * Tells whether the operands of a comparison are primitives of one kind: both
 * have known types of the same kind, a number, a string, a bigint or a boolean.
 * An unknown operand may be of another kind (`0 < '0'` returns `'0'`, `0 <=
 * '0'` returns `0`).
 *
 * @param node - Comparison.
 * @param context - Mutator context of the file.
 * @returns Whether equal operands are the same value.
 */
function hasPrimitiveOperands(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
): boolean {
  let [left, right] = [node.left, node.right].map(
    operand => getTypeView(context.hints.getType(operand)).type,
  )
  return left === right && primitiveTypes.has(left!)
}

/**
 * Reads the truth value an entry of a plan gives the comparison on the inputs
 * where it differs from the original.
 *
 * @param entry - Entry of the plan.
 * @returns The constant, or the value of the new operator in the entry's
 *   region.
 */
function getPlannedValue(entry: PlannedEntry): boolean {
  return typeof entry.to === 'boolean' ?
      entry.to
    : trueRegions.get(entry.to)!.includes(entry.region!)
}
