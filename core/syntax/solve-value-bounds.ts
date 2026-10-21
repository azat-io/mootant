import type {
  AssignmentExpression,
  VariableDeclarator,
  BindingIdentifier,
  UpdateExpression,
  Node,
} from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { ValueBounds } from '../../types/syntax/value-bounds'
import type { ValueBound } from '../../types/syntax/value-bound'
import type { TreeIndex } from '../../types/syntax/tree-index'
import type { CountMap } from '../../types/syntax/count-map'
import type { Binding } from '../../types/syntax/binding'

import { unwrapExpression } from '../tree/unwrap-expression'
import { getBindingClosure } from './get-binding-closure'
import { readNumberLiteral } from './read-number-literal'
import { getGuardBound } from './get-guard-bound'
import { getValueBound } from './get-value-bound'
import { getCountMap } from './get-count-map'

/**
 * Bound of the value that a write gives a counter.
 */
interface WriteBound extends ValueBound {
  /**
   * Whether the value is never below the one before the write: `x++`, or `x +=
   * e` where `e` is never negative.
   */
  grows: boolean
}

/**
 * Bounds of names, or null for a name without one.
 */
type NameBounds = Map<Binding, ValueBound | null>

/**
 * Times the bound of a name may go down before the name gets none, which ends
 * the fixed point.
 */
const MAX_DECREASES = 4

/**
 * Rounds of the fixed point after which no name of the program gets a bound: a
 * lowered bound moves one write further per round, so only a long chain of
 * names that lower each other needs more.
 */
const MAX_ROUNDS = 16

/**
 * Most guards that the reason of a counter quotes: past them, the reason quotes
 * the first two and tells how many more guards its decrements follow, so a
 * counter that goes down after many guards still has a short reason.
 */
const MAX_GUARDS = 3

/**
 * Bound of a name before the fixed point knows it: above every number.
 */
const UNKNOWN: ValueBound = {
  lower: Number.POSITIVE_INFINITY,
  nullable: false,
  integer: true,
  because: '',
}

/**
 * Finds the bounds of the names of a program whose values change (catalog 3.4,
 * N1): counters, the `let` names with a start value and at least one write that
 * are not open (see `getBindingClosure`), and the values of count maps (see
 * `getCountMap`). A bound is an inductive invariant: the start value keeps it,
 * and every write keeps it while every bound holds before the write. Since
 * every write of such a name is in the program, a mutant that only changes what
 * the invariant rules out runs like the original until the first difference,
 * which never comes.
 *
 * One fixed point finds every bound of the program. A counter starts at the
 * bound of its start value and a count map at +Infinity, as it starts empty;
 * each bound only goes down. Every round bounds each start value, written value
 * and stored value against the bounds of the round before (see
 * `getValueBound`), and reads the initializer of a name that never changes
 * once. `x++` gives the bound plus 1, `x += e` the bound plus that of `e`, `x =
 * e` that of `e`, and a decrement by a non-negative number literal right after
 * a guard (see `getGuardBound`) the guard's bound minus the step, so the bound
 * of the counter rests on the comparisons of its guards. A name gets no bound
 * when a write has none or may be nullish, or another write of it is not one of
 * these, when its bound goes down a fifth time, and when it is still +Infinity
 * at the end: its initializers form a cycle, which throws when it runs. The
 * result is the greatest fixed point, so names that keep each other's bounds
 * prove each other. When it takes more than `MAX_ROUNDS` rounds, every counter
 * and count map gets no bound, which keeps the cost linear in the program. Each
 * round words the reasons of the bounds it finds from what it read, so the
 * reasons come from the last round, which reads the final bounds, and no bound
 * is evaluated again to explain it.
 *
 * @param tree - Runtime tree of the program.
 * @param scopes - Scope analysis of the program.
 * @param shared - Scopes of the program whose names code outside them may read
 *   and write (see `getSharedScopes`).
 * @returns Bounds of the counters and count maps, with the program that
 *   `getValueBound` reads to bound any of its expressions.
 */
export function solveValueBounds(
  tree: TreeIndex,
  scopes: ScopeAnalysis,
  shared: ReadonlySet<Node>,
): ValueBounds {
  let entries = new Map<Binding, Binding>()
  let bounds: ValueBounds = {
    counters: new Map(),
    fixed: new Map(),
    maps: new Map(),
    cut: new Map(),
    entries,
    shared,
    scopes,
    tree,
  }
  let counters: Binding[] = []
  let countMaps = new Map<Binding, CountMap>()
  let bindings = new Set(scopes.bindings.values())
  for (let binding of bindings) {
    if (isCounter(bounds, binding)) {
      counters.push(binding)
      bounds.counters.set(binding, UNKNOWN)
      continue
    }
    let countMap = getCountMap(bounds, binding)
    if (countMap) {
      countMaps.set(binding, countMap)
      bounds.maps.set(binding, UNKNOWN)
      for (let entry of countMap.entries) {
        entries.set(entry, binding)
      }
    }
  }
  bounds.counters = new Map(
    counters.map(binding => [binding, boundStart(bounds, binding)]),
  )

  let decreases = new Map<Binding, number>()
  let changed = true
  for (let round = 1; changed; round++) {
    if (round > MAX_ROUNDS) {
      bounds.counters = new Map(counters.map(binding => [binding, null]))
      bounds.maps = new Map(
        [...countMaps.keys()].map(binding => [binding, null]),
      )
      break
    }
    bounds.fixed = new Map()
    bounds.cut = new Map()
    let rounds: [NameBounds, NameBounds][] = [
      [
        bounds.counters,
        new Map(
          counters.map(binding => [binding, boundCounter(bounds, binding)]),
        ),
      ],
      [
        bounds.maps,
        new Map(
          [...countMaps].map(([binding, countMap]) => [
            binding,
            boundCountMap(bounds, binding, countMap),
          ]),
        ),
      ],
    ]
    changed = false
    for (let [current, next] of rounds) {
      for (let [binding, bound] of next) {
        let before = current.get(binding) as ValueBound | null
        let count = decreases.get(binding) ?? 0
        if (!isSameBound(before, bound)) {
          changed = true
          if (isDecrease(before, bound)) {
            count += 1
            decreases.set(binding, count)
          }
        }
        /*
         * The bound of this round replaces an equal one too, so the reason at
         * the end is the one the last round found against the final bounds.
         */
        current.set(binding, count > MAX_DECREASES ? null : bound)
      }
    }
  }

  bounds.counters = keepKnown(bounds.counters)
  bounds.maps = keepKnown(bounds.maps)
  bounds.fixed = new Map()
  bounds.cut = new Map()
  return bounds
}

/**
 * Bounds a counter for the next round: the smallest of its bound, its start
 * value and its written values, each against the bounds of the round before,
 * with the reason that these facts give (see `describeCounter`) and the
 * comparisons of the guards of its decrements.
 *
 * @param bounds - Bounds of the round before.
 * @param binding - Declaration of the counter.
 * @returns The next bound, or null when the counter has none.
 */
function boundCounter(
  bounds: ValueBounds,
  binding: Binding,
): ValueBound | null {
  let current = bounds.counters.get(binding) as ValueBound | null
  let start = current ? boundStart(bounds, binding) : null
  if (!current || !start) {
    return null
  }
  let lower = Math.min(current.lower, start.lower)
  let integer = current.integer && start.integer
  let decrements = new Set<string>()
  let guards = new Set<Node>()
  let grows = true
  for (let write of binding.writes) {
    let written = boundWrite(bounds, write, current)
    if (!written) {
      return null
    }
    lower = Math.min(lower, written.lower)
    integer &&= written.integer
    if (written.guards) {
      decrements.add(written.because)
      for (let guard of written.guards) {
        guards.add(guard)
      }
    } else {
      grows &&= written.grows
    }
  }
  let because = describeCounter(
    describeStart(binding, start),
    lower,
    grows ? decrements : null,
  )
  let bound: ValueBound = { nullable: false, because, integer, lower }
  return guards.size === 0 ? bound : { ...bound, guards }
}

/**
 * Bounds the value that a write gives a counter, assuming its bound holds
 * before the write: `x++`, `x += e`, `x = e`, or a decrement right after a
 * guard, whose bound has the reason and the comparison of the guard.
 *
 * @param bounds - Bounds of the round before.
 * @param write - Write of the counter.
 * @param current - Bound of the counter before the write.
 * @returns Bound of the written value with whether it grows, or null when it
 *   has none.
 */
function boundWrite(
  bounds: ValueBounds,
  write: Node,
  current: ValueBound,
): WriteBound | null {
  if (write.type === 'UpdateExpression') {
    return write.operator === '++' ?
        createWriteBound(current.lower + 1, current.integer, true)
      : boundDecrement(bounds, write, current)
  }
  if (
    write.type !== 'AssignmentExpression' ||
    unwrapExpression(write.left).type !== 'Identifier'
  ) {
    return null
  }
  switch (write.operator) {
    case '+=': {
      let added = getValueBound(bounds, write.right, true)
      return added && !added.nullable ?
          createWriteBound(
            current.lower + added.lower,
            added.integer,
            added.lower >= 0,
          )
        : null
    }
    case '-=':
      return boundDecrement(bounds, write, current)
    case '=': {
      let value = getValueBound(bounds, write.right, true)
      return value && !value.nullable ?
          createWriteBound(value.lower, value.integer, false)
        : null
    }
    default:
      return null
  }
}

/**
 * Bounds the values of a count map for the next round: the smallest of its
 * bound and the values its `set` calls store, against the bounds of the round
 * before.
 *
 * @param bounds - Bounds of the round before.
 * @param binding - Declaration of the count map.
 * @param countMap - Values that the `set` calls of the map store.
 * @returns The next bound, or null when the values have none.
 */
function boundCountMap(
  bounds: ValueBounds,
  binding: Binding,
  countMap: CountMap,
): ValueBound | null {
  let current = bounds.maps.get(binding) as ValueBound | null
  if (!current) {
    return null
  }
  let { integer, lower } = current
  for (let value of countMap.values) {
    let stored = getValueBound(bounds, value, true)
    if (!stored || stored.nullable) {
      return null
    }
    lower = Math.min(lower, stored.lower)
    integer &&= stored.integer
  }
  return {
    because: `every value stored in \`${getName(binding)}\` is at least ${lower}`,
    nullable: false,
    integer,
    lower,
  }
}

/**
 * Explains the bound of a counter from the facts that the round which found it
 * gathered: its start, and whether it only grows, goes down only right after
 * its guards, or is written other values that keep the bound.
 *
 * @param starts - Start of the counter, worded as a clause (see
 *   `describeStart`).
 * @param lower - Smallest number the counter can be.
 * @param decrements - Reasons of the guards of its decrements when every other
 *   write grows it, or null when a write may lower it otherwise; at most
 *   `MAX_GUARDS` of them are quoted.
 * @returns The reason of the bound, such as "`row` starts at 0 and only grows".
 */
function describeCounter(
  starts: string,
  lower: number,
  decrements: ReadonlySet<string> | null,
): string {
  if (!decrements) {
    return `${starts} and every write keeps it at least ${lower}`
  }
  if (decrements.size === 0) {
    return `${starts} and only grows`
  }
  let quoted = [...decrements]
  if (quoted.length > MAX_GUARDS) {
    let rest = quoted.length - MAX_GUARDS + 1
    quoted = [
      ...quoted.slice(0, MAX_GUARDS - 1),
      `right after one of ${rest} more guards`,
    ]
  }
  return `${starts} and goes down only ${quoted.join(' or ')}`
}

/**
 * Bounds the value of a counter after a decrement by `--` or by a non-negative
 * number literal, from the guard right before it.
 *
 * @param bounds - Bounds of the round before.
 * @param decrement - Decrement of the counter.
 * @param current - Bound of the counter before the guard.
 * @returns Bound of the decremented value, or null when the step is not such a
 *   literal or no guard is right before the decrement.
 */
function boundDecrement(
  bounds: ValueBounds,
  decrement: AssignmentExpression | UpdateExpression,
  current: ValueBound,
): WriteBound | null {
  let step =
    decrement.type === 'UpdateExpression' ?
      1
    : readNumberLiteral(decrement.right)
  let guard =
    step !== null && step >= 0 ?
      getGuardBound(bounds, decrement, current)
    : null
  return (
    guard && {
      ...guard,
      integer: guard.integer && Number.isSafeInteger(step),
      lower: guard.lower - step!,
      grows: false,
    }
  )
}

/**
 * Tells whether a binding is a counter: a `let` that declares the name as a
 * whole, with an initializer and at least one write, that is not open (see
 * `getBindingClosure`). A `var` reads `undefined` before its declaration, so it
 * is never one; nor are parameters, imports and class fields.
 *
 * @param bounds - Bounds of the program, with its scope analysis and the scopes
 *   whose names code outside them may read and write.
 * @param binding - Binding to check.
 * @returns Whether the binding is a counter.
 */
function isCounter(bounds: ValueBounds, binding: Binding): boolean {
  if (binding.kind !== 'let' || binding.writes.length === 0) {
    return false
  }
  let declarator = binding.declaration as VariableDeclarator
  return (
    declarator.id === binding.identifier &&
    declarator.init !== null &&
    getBindingClosure(bounds.scopes, bounds.shared, binding) !== 'open'
  )
}

/**
 * Tells whether two bounds of a name in the fixed point are the same.
 *
 * @param first - Bound or none.
 * @param second - Bound or none.
 * @returns Whether both are none, or both have the same smallest number and
 *   integer flag.
 */
function isSameBound(
  first: ValueBound | null,
  second: ValueBound | null,
): boolean {
  return (
    first === second ||
    (first !== null &&
      second !== null &&
      first.lower === second.lower &&
      first.integer === second.integer)
  )
}

/**
 * Tells whether a bound went down from a number: going down from +Infinity,
 * which every count map starts at, does not count.
 *
 * @param before - Bound of the round before, or none.
 * @param after - Bound of this round, never above it, or none.
 * @returns Whether both are bounds and the smallest number went down.
 */
function isDecrease(
  before: ValueBound | null,
  after: ValueBound | null,
): boolean {
  return (
    before !== null &&
    after !== null &&
    after.lower < before.lower &&
    before.lower !== Number.POSITIVE_INFINITY
  )
}

/**
 * Words the start of a counter: its start value when it is a number literal, or
 * the bound of the start value.
 *
 * @param binding - Declaration of the counter.
 * @param start - Bound of the start value.
 * @returns The clause, such as "`row` starts at 0".
 */
function describeStart(binding: Binding, start: ValueBound): string {
  let value =
    readNumberLiteral(getStartValue(binding)) ?? `${start.lower} or more`
  return `\`${getName(binding)}\` starts at ${value}`
}

/**
 * Drops the bounds still at +Infinity at the end of the fixed point, which only
 * a cycle of initializers keeps.
 *
 * @param names - Bounds of the last round of the fixed point.
 * @returns The bounds, with null for those names.
 */
function keepKnown(names: NameBounds): NameBounds {
  return new Map(
    [...names].map(([binding, bound]) => [
      binding,
      bound?.lower === Number.POSITIVE_INFINITY ? null : bound,
    ]),
  )
}

/**
 * Bounds the start value of a counter.
 *
 * @param bounds - Bounds of the round before.
 * @param binding - Binding of the counter.
 * @returns Bound of the start value, or null when it has none or may be
 *   nullish.
 */
function boundStart(bounds: ValueBounds, binding: Binding): ValueBound | null {
  let start = getValueBound(bounds, getStartValue(binding), true)
  return start && !start.nullable ? start : null
}

/**
 * Builds the bound of a value that a write other than a decrement gives a
 * counter.
 *
 * @param lower - Smallest number the value can be.
 * @param integer - Whether the value is always an integer.
 * @param grows - Whether the value is never below the one before the write.
 * @returns The bound, which is never nullish.
 */
function createWriteBound(
  lower: number,
  integer: boolean,
  grows: boolean,
): WriteBound {
  return { nullable: false, because: '', integer, grows, lower }
}

/**
 * Finds the start value of a counter.
 *
 * @param binding - Binding of a `let` with an initializer.
 * @returns Initializer of its declarator.
 */
function getStartValue(binding: Binding): Node {
  return (binding.declaration as VariableDeclarator).init!
}

/**
 * Reads the name that a counter or a count map declares.
 *
 * @param binding - Declaration whose identifier introduces the name.
 * @returns The name as written.
 */
function getName(binding: Binding): string {
  return (binding.identifier as BindingIdentifier).name
}
