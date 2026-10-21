import type { ValueBound } from './value-bound'

/**
 * Bound of an expression while `getValueBound` builds it: the numbers of the
 * bound with the clauses of its reason, kept apart until the bound leaves
 * `getValueBound`, whether number literals alone make the value, and how deep
 * its parts sit.
 */
export interface BoundEvaluation extends Omit<ValueBound, 'because'> {
  /**
   * First facts the bound rests on, at most four, each worded as a clause such
   * as "a length is never negative", in the order they were first found,
   * without repeats; none for a value that number literals alone make. A clause
   * never holds another.
   */
  reasons: readonly string[]

  /**
   * Whether number literals alone make the value, as in `0` or `ok ? 1 : 2`.
   */
  literal: boolean

  /**
   * Levels of nested expressions and initializers between the expression and
   * the deepest part that its bound reads.
   */
  height: number

  /**
   * Whether the bound rests on more facts than its clauses list, which only a
   * value with four clauses can.
   */
  more: boolean
}
