import type {
  AssignmentExpression,
  PrivateInExpression,
  BinaryExpression,
  UpdateExpression,
  Node,
} from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'
import type { Replacement } from '../../../types/replacement'
import type { SkipNote } from '../../../types/skip-note'
import type { RunningValue } from './get-running-value'

import { getProvenComparisonValue } from './get-proven-comparison-value'
import { isNoOpCallbackConstant } from './is-no-op-callback-constant'
import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { unwrapExpression } from '../../tree/unwrap-expression'
import { getMemberPath } from '../../syntax/get-member-path'
import { getOwnedConstants } from './get-owned-constants'
import { getLeaveNowValue } from './get-leave-now-value'
import { getRootName } from '../../syntax/get-root-name'
import { getRunningValue } from './get-running-value'
import { getLiteralValue } from './get-literal-value'
import { isFunction } from '../../syntax/is-function'
import { isNumericPair } from './is-numeric-pair'
import { getNumberText } from './get-number-text'
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
 * logical-operator owns. Skipped entries are returned with the rule that skips
 * them. The plan is pure: other mutators read it without running
 * comparison-operator.
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
  let valueSkips = getValueSkips(node, context, running)
  let constantSkips = new Map([
    ...valueSkips,
    ...getOwnedConstants(node, context),
  ])
  let operatorSkips = new Map<string | null, SkipNote>([
    [
      getCounterEntry(node, running),
      {
        reason:
          'the loop moves the counter in one direction only, so this form ends the loop at the same point',
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
  let minMax = isMinMaxIdiom(node, context)

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
    if (region && impossible.has(region)) {
      let note: SkipNote = {
        reason:
          'a lower bound of an operand makes the inputs where it differs impossible',
        rule: 'lower-bound',
      }
      skip(text, note)
      if (typeof to === 'boolean') {
        skippedConstants.set(to, note)
      }
      continue
    }
    if (typeof to === 'boolean') {
      if (shift === null) {
        let note = constantSkips.get(to)
        if (note) {
          skip(text, note)
          skippedConstants.set(to, note)
        } else {
          entries.push({ kind: 'constant', value: to, region, text })
        }
        continue
      }
      let note = getBoundedSkip(
        valueSkips,
        getImpossibleRegions(node, context, shift.step),
        operator,
      )
      if (note) {
        skip(text, note)
        skippedConstants.set(to, note)
      } else {
        entries.push({ kind: 'shift', value: to, region, text })
      }
      continue
    }
    let operatorNote =
      operatorSkips.get(to) ??
      (minMax && region === 'eq' ?
        {
          reason:
            'at equality both branches of the min/max ternary give the same value',
          rule: 'min-max-idiom' as const,
        }
      : null)
    let bounded =
      operatorNote ? null : getBoundedSkip(valueSkips, impossible, to)
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
        reason: `a lower bound of an operand makes every input where the comparison is not ${value} impossible`,
        rule: 'lower-bound',
      })
    }
  }
  return { skippedConstants, entries, skipped }
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
        note = {
          reason: `${value} keeps the loop running forever, so only a timeout could kill it`,
          rule: 'loop-running',
        }

        break
      }
      case leaveNow: {
        note = {
          reason:
            "leaving a first exit test's loop at once is the loop's never-run mutant",
          rule: 'O13',
        }

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
          note = {
            reason:
              "it makes the callback a no-op, which is method-call's removal of the call",
            rule: 'O12',
          }
        }
    }
    if (note) {
      skips.set(value, note)
    }
  }
  return skips
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
 * Finds why an entry that the lower bound leaves constant is skipped: the entry
 * is that constant, so the skip of the constant applies.
 *
 * @param valueSkips - Skips of the constants by their value.
 * @param impossible - Regions the lower bound makes impossible for the entry.
 * @param operator - Operator of the entry's comparison.
 * @returns The skip of the constant, reworded for the entry, or null.
 */
function getBoundedSkip(
  valueSkips: ReadonlyMap<boolean, SkipNote>,
  impossible: Set<ComparisonRegion>,
  operator: string,
): SkipNote | null {
  let constant = getEntryConstant(impossible, operator)
  let note = constant === null ? undefined : valueSkips.get(constant)
  if (!note) {
    return null
  }
  return {
    ...note,
    reason: `a lower bound of an operand makes it the constant ${constant}, and ${note.reason}`,
    heuristic: true,
  }
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
