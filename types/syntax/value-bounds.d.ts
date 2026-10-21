import type { BoundEvaluation } from './bound-evaluation'
import type { AnalyzedProgram } from './analyzed-program'
import type { ValueBound } from './value-bound'
import type { Binding } from './binding'

/**
 * Bounds of the names of a program whose values change, as the fixed point of
 * `solveValueBounds` finds them, with the program that `getValueBound` reads to
 * bound any of its expressions.
 */
export interface ValueBounds extends AnalyzedProgram {
  /**
   * Bound of the initializer of every name read so far through the initializer
   * that always gives its value, cleared each round of the fixed point: null
   * for a name without a bound, and for one whose value number literals alone
   * make, since constants are configuration. A name read too deep to reach the
   * end of its initializer is left out, since a read closer to the start may
   * bound it (see `cut`).
   */
  fixed: Map<Binding, BoundEvaluation | null>

  /**
   * Bound of every counter, or null when it has none.
   */
  counters: Map<Binding, ValueBound | null>

  /**
   * Count map whose values each value name of a `for...of` loop over a count
   * map takes.
   */
  entries: ReadonlyMap<Binding, Binding>

  /**
   * Bound of the values of every count map, or null when they have none.
   */
  maps: Map<Binding, ValueBound | null>

  /**
   * Shallowest level below the start of an evaluation at which each name that
   * `fixed` leaves out was read, cleared with it: a part of the initializer of
   * the name sat too deep from there, or the initializer is being read now. A
   * read of the name at that level or deeper has no bound either, so the
   * initializer is read again only from a shallower level, and a read of a name
   * inside its own initializer stops at once, as a fresh evaluation of a cycle
   * of initializers always ends at the depth limit.
   */
  cut: Map<Binding, number>
}
