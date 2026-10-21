import type { BindingIdentifier, Node } from 'oxc-parser'

import type { BoundEvaluation } from '../../types/syntax/bound-evaluation'
import type { ValueBounds } from '../../types/syntax/value-bounds'
import type { ValueBound } from '../../types/syntax/value-bound'
import type { Binding } from '../../types/syntax/binding'

import { getFixedInitializer } from './get-fixed-initializer'
import { unwrapExpression } from '../tree/unwrap-expression'
import { getCollectionClass } from './get-collection-class'
import { readNumberLiteral } from './read-number-literal'

/**
 * Numbers of a value made of two parts, with whether number literals alone make
 * it.
 */
type JoinedNumbers = Pick<
  BoundEvaluation,
  'nullable' | 'integer' | 'literal' | 'lower'
>

/**
 * Result of an evaluation: the bound, null when the expression has none, or
 * undefined when a part sits more than `MAX_DEPTH` levels below the start of
 * the evaluation, which a start closer to the part may reach, so no cache keeps
 * it.
 */
type Outcome = BoundEvaluation | undefined | null

/**
 * Deepest level of nested expressions and initializers that one evaluation
 * reads: a deeper part has no bound, so a long chain of names cannot exhaust
 * the call stack.
 */
const MAX_DEPTH = 100

/**
 * Most clauses that an evaluation keeps and the reason of a bound lists: a
 * value that rests on more facts keeps the first ones and that there are more,
 * and its reason lists the first three, so neither the reason nor the
 * evaluations kept for names grow with the number of facts a value sums.
 */
const MAX_CLAUSES = 4

/**
 * Reasons of a value that number literals alone make: none.
 */
const NO_REASONS: readonly string[] = []

/**
 * Methods that return a position or -1 when nothing is found.
 */
let positionMethods = new Set([
  'findLastIndex',
  'lastIndexOf',
  'findIndex',
  'indexOf',
  'search',
])

/**
 * Finds the smallest number an expression can be when the syntax of its program
 * tells it (catalog 3.4), through parentheses and TypeScript wrappers:
 *
 * - A non-computed `length` member of any receiver has 0: arrays, strings,
 *   functions and typed arrays have it, and an object with a negative `length`
 *   is rare. A `size` member has 0 only on a proven Map or Set (see
 *   `getCollectionClass`), and `byteLength` never, since nothing tells an array
 *   buffer from any object that may hold a negative one.
 * - A call of a member named `indexOf`, `lastIndexOf`, `findIndex`,
 *   `findLastIndex` or `search` has -1.
 * - A counter has the bound that the fixed point found (see `solveValueBounds`),
 *   with the guards it rests on.
 * - A call of the `get` method of a count map has the bound of its values and may
 *   be `undefined`, and the value name of a `for...of` loop over it has that
 *   bound.
 * - A name whose initializer always gives its value (see `getFixedInitializer`)
 *   has the bound of the initializer.
 * - A sum of two bounds that are never nullish has the sum of the bounds, a
 *   conditional expression the smaller bound of its branches, and a nullish
 *   coalescing the bound of its left side, with that of its right side when the
 *   left side may be nullish.
 *
 * Members and methods are recognized by name. An optional chain may be
 * `undefined`. The value of a number literal is a bound only as the start value
 * or a written value of a name that changes, or a value a count map stores:
 * constants are configuration, so a value that number literals alone make,
 * directly or through a name that never changes, has no bound otherwise. A part
 * more than `MAX_DEPTH` levels of nested expressions and initializers below the
 * expression has no bound, wherever earlier questions read it from.
 *
 * The reason lists each fact the bound rests on once, such as "a length is
 * never negative" or the reason of a counter, after "`x` keeps its initial
 * value" when the expression is a name followed through its initializer. Names
 * read on the way add no clause of their own, and past `MAX_CLAUSES` clauses
 * the reason lists the first three and that other facts follow.
 *
 * @param bounds - Bounds of the names of the program whose values change.
 * @param node - Expression to bound.
 * @param written - Whether the expression is the start value or a written value
 *   of a name that changes, or a value a count map stores, where number
 *   literals count; false when omitted.
 * @returns The bound, or null when it is not known.
 */
export function getValueBound(
  bounds: ValueBounds,
  node: Node,
  written = false,
): ValueBound | null {
  let evaluation = evaluate(bounds, node, 0)
  if (!evaluation || (!written && evaluation.literal)) {
    return null
  }
  let { nullable, integer, guards, lower } = evaluation
  let binding = getBinding(bounds, node)
  let kept: string | null = null
  /*
   * Only a name followed through its initializer has a bound kept there.
   */
  if (binding && bounds.fixed.get(binding)) {
    let { name } = binding.identifier as BindingIdentifier
    kept = `\`${name}\` keeps its initial value`
  }
  let bound: ValueBound = {
    because: wordReason(kept, evaluation),
    nullable,
    integer,
    lower,
  }
  return guards ? { ...bound, guards } : bound
}

/**
 * Bounds an expression of the program. Every bound it gives fits the depth
 * limit: the expression and its deepest part are at most `MAX_DEPTH` levels
 * below the start.
 *
 * @param bounds - Bounds of the names of the program whose values change.
 * @param node - Expression to bound.
 * @param depth - Level of the expression below the one the evaluation started
 *   from, through nested expressions and initializers.
 * @returns The bound, null when the expression has none, or undefined when a
 *   part is too deep.
 */
function evaluate(bounds: ValueBounds, node: Node, depth: number): Outcome {
  if (depth > MAX_DEPTH) {
    return undefined
  }
  let current = unwrapExpression(node)
  let next = depth + 1
  switch (current.type) {
    case 'ConditionalExpression': {
      let consequent = evaluate(bounds, current.consequent, next)
      if (!consequent) {
        return consequent
      }
      let alternate = evaluate(bounds, current.alternate, next)
      return (
        alternate &&
        join(consequent, alternate, {
          nullable: consequent.nullable || alternate.nullable,
          lower: Math.min(consequent.lower, alternate.lower),
          integer: consequent.integer && alternate.integer,
          literal: consequent.literal && alternate.literal,
        })
      )
    }
    case 'LogicalExpression': {
      if (current.operator !== '??') {
        return null
      }
      let left = evaluate(bounds, current.left, next)
      if (!left?.nullable) {
        return left && raise(left)
      }
      /*
       * A value that may be nullish is never made of number literals alone.
       */
      let right = evaluate(bounds, current.right, next)
      return (
        right &&
        join(left, right, {
          lower: Math.min(left.lower, right.lower),
          integer: left.integer && right.integer,
          nullable: right.nullable,
          literal: false,
        })
      )
    }
    case 'BinaryExpression': {
      if (current.operator !== '+') {
        return null
      }
      let left = keepNonNullish(evaluate(bounds, current.left, next))
      if (!left) {
        return left
      }
      let right = keepNonNullish(evaluate(bounds, current.right, next))
      return (
        right &&
        join(left, right, {
          integer: left.integer && right.integer,
          literal: left.literal && right.literal,
          lower: left.lower + right.lower,
          nullable: false,
        })
      )
    }
    case 'MemberExpression': {
      if (current.computed || current.property.type !== 'Identifier') {
        return null
      }
      let because: string | null = null
      let collection =
        current.property.name === 'size' ?
          getCollectionClass(bounds, current.object)
        : null
      if (current.property.name === 'length') {
        because = 'a length is never negative'
      } else if (collection) {
        let object = unwrapExpression(current.object)
        because =
          object.type === 'Identifier' ?
            `\`${object.name}\` is a ${collection}, whose size is never negative`
          : `the size of a ${collection} is never negative`
      }
      return because === null ? null : createFact(because, 0, current.optional)
    }
    case 'ChainExpression': {
      let inner = evaluate(bounds, current.expression, next)
      return inner && { ...raise(inner), nullable: true }
    }
    case 'UnaryExpression':
    case 'Literal': {
      let value = readNumberLiteral(current)
      return value === null ? null : (
          {
            integer: Number.isSafeInteger(value),
            reasons: NO_REASONS,
            nullable: false,
            literal: true,
            lower: value,
            more: false,
            height: 0,
          }
        )
    }
    case 'CallExpression': {
      let callee = unwrapExpression(current.callee)
      if (
        callee.type !== 'MemberExpression' ||
        callee.computed ||
        callee.property.type !== 'Identifier'
      ) {
        return null
      }
      let { name } = callee.property
      if (positionMethods.has(name)) {
        return createFact(
          `\`${name}\` returns -1 or an index`,
          -1,
          current.optional || callee.optional,
        )
      }
      let map =
        name === 'get' && current.arguments.length === 1 ?
          getBinding(bounds, callee.object)
        : null
      let values = map ? bounds.maps.get(map) : null
      return values ? readBound(values, true) : null
    }
    case 'Identifier': {
      let binding = bounds.scopes.bindings.get(current)
      return binding ? evaluateName(bounds, binding, next) : null
    }
    default:
      return null
  }
}

/**
 * Bounds a name: a counter, the value name of a `for...of` loop over a count
 * map, or a name whose initializer always gives its value. The bound of such an
 * initializer is kept with its height, so a later read anywhere needs no second
 * evaluation and fits the depth limit exactly when a fresh evaluation would. An
 * initializer that the limit cuts keeps the level it was read from instead: a
 * read at that level or deeper is cut too, so the initializer is read again
 * only from a shallower level, at most `MAX_DEPTH` times. The level is kept
 * while the initializer is read, so a cycle of initializers stops at its first
 * repeat, where a fresh evaluation would go round until the limit cuts it.
 *
 * @param bounds - Bounds of the names of the program whose values change.
 * @param binding - Declaration that an identifier of the expression resolves
 *   to.
 * @param depth - Level of the initializer below the start of the evaluation.
 * @returns The bound of the name, null, or undefined when the initializer is
 *   too deep.
 */
function evaluateName(
  bounds: ValueBounds,
  binding: Binding,
  depth: number,
): Outcome {
  let counter = bounds.counters.get(binding)
  if (counter !== undefined) {
    return counter && readBound(counter, false)
  }
  let map = bounds.entries.get(binding)
  if (map) {
    let values = bounds.maps.get(map)
    return values ? readBound(values, false) : null
  }
  let fixed = bounds.fixed.get(binding)
  if (fixed === undefined) {
    if (depth >= (bounds.cut.get(binding) ?? Number.POSITIVE_INFINITY)) {
      return undefined
    }
    bounds.cut.set(binding, depth)
    let initializer = getFixedInitializer(bounds.scopes, bounds.shared, binding)
    let value = initializer && evaluate(bounds, initializer, depth)
    if (value === undefined) {
      return undefined
    }
    bounds.cut.delete(binding)
    fixed = value && !value.literal ? value : null
    bounds.fixed.set(binding, fixed)
  } else if (fixed && depth + fixed.height > MAX_DEPTH) {
    return undefined
  }
  return fixed && raise(fixed)
}

/**
 * Joins the bounds of the two parts of a value: their heights, and their
 * reasons without repeats, in the order they were first found. The value keeps
 * at most `MAX_CLAUSES` clauses and whether it rests on more facts, so what it
 * keeps does not grow with the facts below it. When the second part adds no
 * clause, the value shares the clauses of the first.
 *
 * @param first - Bound of the part read first.
 * @param second - Bound of the other part.
 * @param numbers - Numbers of the value.
 * @returns The bound of the value, one level above its parts.
 */
function join(
  first: BoundEvaluation,
  second: BoundEvaluation,
  numbers: JoinedNumbers,
): BoundEvaluation {
  let { reasons } = first
  let more = first.more || second.more
  for (let reason of second.reasons) {
    if (reasons.includes(reason)) {
      continue
    }
    if (reasons.length === MAX_CLAUSES) {
      more = true
    } else {
      reasons = [...reasons, reason]
    }
  }
  return {
    height: Math.max(first.height, second.height) + 1,
    reasons,
    more,
    ...numbers,
  }
}

/**
 * Reads the bound that the fixed point found for a counter or the values of a
 * count map, whose reason is a single fact.
 *
 * @param bound - Bound of the counter or the values.
 * @param nullable - Whether the value read may also be nullish.
 * @returns The bound, with the guards it rests on.
 */
function readBound(bound: ValueBound, nullable: boolean): BoundEvaluation {
  let { integer, because, guards, lower } = bound
  let evaluation: BoundEvaluation = {
    reasons: [because],
    literal: false,
    more: false,
    height: 0,
    nullable,
    integer,
    lower,
  }
  return guards ? { ...evaluation, guards } : evaluation
}

/**
 * Words the reason of a bound from its clauses, at most `MAX_CLAUSES` of them:
 * a longer reason lists the first three clauses and that other facts follow.
 *
 * @param first - Clause that comes before the others, or null.
 * @param evaluation - Bound with the other clauses, in order.
 * @returns The reason, such as "a length is never negative".
 */
function wordReason(first: string | null, evaluation: BoundEvaluation): string {
  let clauses =
    first === null ? evaluation.reasons : [first, ...evaluation.reasons]
  return evaluation.more || clauses.length > MAX_CLAUSES ?
      [...clauses.slice(0, MAX_CLAUSES - 1), 'and other facts'].join('; ')
    : clauses.join('; ')
}

/**
 * Builds the bound of a value that a single fact of the program tells: an
 * integer that is not made of number literals.
 *
 * @param because - The fact, worded as a clause.
 * @param lower - Smallest number the value can be.
 * @param nullable - Whether the value may also be nullish.
 * @returns The bound, with no part below it.
 */
function createFact(
  because: string,
  lower: number,
  nullable: boolean,
): BoundEvaluation {
  return {
    reasons: [because],
    literal: false,
    integer: true,
    more: false,
    height: 0,
    nullable,
    lower,
  }
}

/**
 * Finds the binding of a name, through parentheses and TypeScript wrappers.
 *
 * @param bounds - Bounds of the names of the program whose values change.
 * @param node - Expression.
 * @returns The binding, or null when the expression is not a declared name.
 */
function getBinding(bounds: ValueBounds, node: Node): Binding | null {
  let current = unwrapExpression(node)
  return current.type === 'Identifier' ?
      (bounds.scopes.bindings.get(current) ?? null)
    : null
}

/**
 * Lifts the bound of the only part read to the expression around it.
 *
 * @param part - Bound of the part.
 * @returns The same bound, one level higher.
 */
function raise(part: BoundEvaluation): BoundEvaluation {
  return { ...part, height: part.height + 1 }
}

/**
 * Keeps the bound of an operand of `+` only when it is never nullish.
 *
 * @param part - Outcome of the operand.
 * @returns The outcome, or null when the operand may be nullish.
 */
function keepNonNullish(part: Outcome): Outcome {
  return part?.nullable ? null : part
}
