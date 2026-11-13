import type { MutantKind } from './mutant-kind'
import type { Mutant } from './mutant'

/**
 * Mutants that replace the same range of a file, with the groups of the ranges
 * inside it. The switched file hosts each group once. The range of a group of
 * removals of array elements or object members is their literal, which they are
 * hosted around together.
 */
export interface MutantRange {
  /**
   * Groups of the ranges inside this one, sorted by start.
   */
  children: MutantRange[]

  /**
   * Mutants of the range in list order, not empty.
   */
  mutants: Mutant[]

  /**
   * How the group is hosted: a conditional expression, an `if` statement, or a
   * conditional expression around an array or object literal with a copy of it
   * for the removals of its elements or members.
   */
  kind: MutantKind

  /**
   * Offset of the first replaced code unit, or of the literal of an `element`
   * or `property` group.
   */
  start: number

  /**
   * Offset just past the last replaced code unit, or past the literal of an
   * `element` or `property` group.
   */
  end: number
}
