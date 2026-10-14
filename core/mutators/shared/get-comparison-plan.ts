import type {
  AssignmentExpression,
  PrivateInExpression,
  LogicalExpression,
  BinaryExpression,
  UpdateExpression,
  Node,
} from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'
import type { RunningValue } from './get-running-value'

import { getProvenComparisonValue } from './get-proven-comparison-value'
import { isConstantEligibleGroup } from './is-constant-eligible-group'
import { isNoOpCallbackConstant } from './is-no-op-callback-constant'
import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { isBooleanModeOperand } from './is-boolean-mode-operand'
import { unwrapExpression } from '../../tree/unwrap-expression'
import { getMemberPath } from '../../syntax/get-member-path'
import { getLeaveNowValue } from './get-leave-now-value'
import { getRootName } from '../../syntax/get-root-name'
import { getRunningValue } from './get-running-value'
import { isBooleanValued } from './is-boolean-valued'
import { getLiteralValue } from './get-literal-value'
import { isFunction } from '../../syntax/is-function'
import { getNegationTop } from './get-negation-top'
import { isNumericPair } from './is-numeric-pair'
import { getNumberText } from './get-number-text'
import { walkTree } from '../../tree/walk-tree'
import { getTypeView } from './get-type-view'
import { isAndOr } from './is-and-or'

/**
 * Mutant that comparison-operator emits for a comparison.
 */
export interface ComparisonEntry {
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
 * Plans of relational comparisons, and of numeric equalities.
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
 * entry of a min/max idiom, a first exit test's leave-now constant, and entries
 * that make a no-op callback. A swap or shifted literal that the lower bound
 * leaves constant is skipped like that constant, except for the constants that
 * logical-operator owns. The plan is pure: other mutators read it without
 * running comparison-operator.
 *
 * @param node - Comparison of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns The entries comparison-operator emits, in emission order.
 */
export function getComparisonPlan(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
): ComparisonEntry[] {
  let { sourceCode, settings, hints } = context
  let { operator, right, left } = node
  let planned: PlannedEntry[] = orderedPlans.get(operator) ?? constantPlan
  if (
    (operator === '===' || operator === '==') &&
    isNumericPair(hints.getType(left), hints.getType(right))
  ) {
    planned = equalPlan
  } else if (
    (operator === '!==' || operator === '!=') &&
    isNumericPair(hints.getType(left), hints.getType(right))
  ) {
    planned = notEqualPlan
  }
  let shift = orderedPlans.has(operator) ? getShift(node, context) : null
  let impossible = getImpossibleRegions(node, context, 0)
  let running = settings.timeouts ? null : getRunningValue(node, context)
  let proven = getProvenComparisonValue(node, context)
  let leaveNow = getLeaveNowValue(node, context)
  let skippedValues = new Set<boolean | null>(
    [true, false].filter(
      value =>
        value === proven ||
        value === leaveNow ||
        value === running?.value ||
        isNoOpCallbackConstant(node, value, context),
    ),
  )
  let skippedConstants = new Set([
    ...getOwnedConstants(node, context),
    ...skippedValues,
  ])
  let skippedOperators = new Set<string | null>([
    getCounterEntry(node, running),
  ])
  if (running) {
    skippedOperators.add(running.value ? '!=' : '==')
  }
  let minMax = isMinMaxIdiom(node, context)

  let entries: ComparisonEntry[] = []
  for (let { region, to } of planned) {
    if (region && impossible.has(region)) {
      continue
    }
    if (typeof to === 'boolean') {
      if (shift === null) {
        if (!skippedConstants.has(to)) {
          entries.push({
            text: String(to),
            kind: 'constant',
            value: to,
            region,
          })
        }
      } else if (
        !skippedValues.has(
          getEntryConstant(
            getImpossibleRegions(node, context, shift.step),
            operator,
          ),
        )
      ) {
        entries.push({ text: shift.text, kind: 'shift', value: to, region })
      }
      continue
    }
    if (
      skippedOperators.has(to) ||
      (minMax && region === 'eq') ||
      skippedValues.has(getEntryConstant(impossible, to))
    ) {
      continue
    }
    entries.push({
      value: trueRegions.get(to)!.includes(region!),
      text: sourceCode.replaceOperator(node, to),
      kind: 'swap',
      region,
    })
  }
  return entries
}

/**
 * Finds the constants that logical-operator owns (catalog 4.6, rule 2, O3):
 * both in a boolean-mode operand; in value mode, the constant that forces the
 * left operand of a `&&` or `||` to its identity, and the constant that makes a
 * constant-eligible group take its absorbing value while every earlier operand
 * is boolean-valued.
 *
 * @param node - Comparison.
 * @param context - Mutator context of the file.
 * @returns The constants to skip.
 */
function getOwnedConstants(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
): boolean[] {
  if (isBooleanModeOperand(node, context)) {
    return [true, false]
  }
  let { sourceCode, syntax } = context
  let top = getNegationTop(node, context)
  let negated = top.negations % 2 === 1
  let { parent, key } = syntax.getContextSlot(top.node)
  if (!isAndOr(parent)) {
    return []
  }
  let owned: boolean[] = []
  if (key === 'left') {
    owned.push((parent.operator === '&&') !== negated)
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
    owned.push((parent.operator === '||') !== negated)
  }
  return owned
}

/**
 * Finds the regions that a lower bound makes impossible (catalog 4.6, rule 1):
 * with one operand bounded below by `L` and the other a number literal `c`,
 * "bounded < c" is impossible when `c <= L`, and "bounded = c" when `c < L`.
 * With a step, the literal is read moved by it, as in the shifted literal.
 *
 * @param node - Comparison.
 * @param context - Mutator context of the file.
 * @param step - Amount added to the literal: `0`, or the step of the shifted
 *   literal.
 * @returns Impossible regions, named from the left operand.
 */
function getImpossibleRegions(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
  step: number,
): Set<ComparisonRegion> {
  let impossible = new Set<ComparisonRegion>()
  for (let [bounded, literal, mirrored] of [
    [node.left, node.right, false],
    [node.right, node.left, true],
  ] as const) {
    let bound = context.syntax.getLowerBound(bounded)
    let value = getLiteralValue(literal)
    if (
      bound === null ||
      (typeof value !== 'number' && typeof value !== 'bigint')
    ) {
      continue
    }
    let limit = Number(value) + step
    let regions: ComparisonRegion[] = []
    if (limit <= bound) {
      regions.push('lt')
    }
    if (limit < bound) {
      regions.push('eq')
    }
    for (let region of regions) {
      impossible.add(mirrored ? mirroredRegions.get(region)! : region)
    }
  }
  return impossible
}

/**
 * Finds the direction in which a loop moves an operand: up for `++` or `+=`
 * with a positive number literal, down for `--` or `-=` with one. Updates are
 * matched by member path, so `this.count++` says nothing about `this.pos`; an
 * update of a prefix of the path, or of a member without a static path on the
 * same root, counts as an assignment of another kind.
 *
 * @param loop - Loop whose test, update and body are searched, without nested
 *   functions.
 * @param path - Member path of an operand, or null.
 * @returns The only direction of every update of the operand, or null when
 *   there is none, several, or an assignment of another kind.
 */
function getDirection(
  loop: RunningValue['loop'],
  path: string[] | null,
): 'down' | 'up' | null {
  if (path === null) {
    return null
  }
  let directions = new Set<string>()
  let parts = [
    loop.test,
    loop.type === 'ForStatement' ? loop.update : null,
    loop.body,
  ]
  for (let part of parts) {
    if (part) {
      walkTree(part, child => {
        if (
          child.type === 'UpdateExpression' ||
          child.type === 'AssignmentExpression'
        ) {
          let direction = getUpdateDirection(child, path)
          if (direction !== null) {
            directions.add(direction)
          }
        }
        return !isFunction(child)
      })
    }
  }
  let [only] = directions
  return directions.size === 1 && (only === 'up' || only === 'down') ?
      only
    : null
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
 * Finds the relational entry that a one-way counter makes equivalent in a loop
 * condition (catalog 4.6, rule 3): for `!==` or `!=` that keeps the loop
 * running, or `===` or `==` that leaves it, when exactly one operand is moved
 * under the loop by updates of one direction only.
 *
 * @param node - Comparison.
 * @param running - Running value of the comparison, or null.
 * @returns The operator of the entry to skip, or null.
 */
function getCounterEntry(
  node: PrivateInExpression | BinaryExpression,
  running: RunningValue | null,
): string | null {
  let expected = running?.value ? ['!==', '!='] : ['===', '==']
  if (!running || !expected.includes(node.operator)) {
    return null
  }
  let leftDirection = getDirection(running.loop, getMemberPath(node.left))
  let rightDirection = getDirection(running.loop, getMemberPath(node.right))
  if ((leftDirection === null) === (rightDirection === null)) {
    return null
  }
  let towardRight = (leftDirection ?? rightDirection) === 'up'
  let counterLeft = leftDirection !== null
  if (running.value) {
    return towardRight === counterLeft ? '<' : '>'
  }
  return towardRight === counterLeft ? '>=' : '<='
}

/**
 * Reads the direction in which an update moves an operand, matched by member
 * path.
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
  let target =
    update.type === 'UpdateExpression' ? update.argument : update.left
  let targetPath = getMemberPath(target)
  if (targetPath === null) {
    return getRootName(target) === path[0] ? 'other' : null
  }
  if (
    targetPath.length > path.length ||
    targetPath.some((name, index) => name !== path[index])
  ) {
    return null
  }
  if (targetPath.length < path.length) {
    return 'other'
  }
  if (update.type === 'UpdateExpression') {
    return update.operator === '++' ? 'up' : 'down'
  }
  return getAssignmentDirection(update.operator, update.right)
}

/**
 * Builds the shifted literal of a relational comparison with exactly one number
 * literal operand (catalog 4.6): strict operators shrink the true region,
 * non-strict ones grow it.
 *
 * @param node - Relational comparison.
 * @param context - Mutator context of the file.
 * @returns The comparison text with the literal moved one step and the step, or
 *   null.
 */
function getShift(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
): Shift | null {
  let leftLiteral = isNumberLiteral(node.left)
  if (leftLiteral === isNumberLiteral(node.right)) {
    return null
  }
  let literal = unwrapParentheses(leftLiteral ? node.left : node.right)
  let shrinks = node.operator === '<' || node.operator === '>='
  let step: -1 | 1 = shrinks === leftLiteral ? 1 : -1
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
 * Tells whether an operand is a number or BigInt literal, or `-` applied to
 * one.
 *
 * @param node - Operand, through parentheses.
 * @returns Whether the operand is a number literal.
 */
function isNumberLiteral(node: Node): boolean {
  let value = getLiteralValue(node)
  return typeof value === 'number' || typeof value === 'bigint'
}
