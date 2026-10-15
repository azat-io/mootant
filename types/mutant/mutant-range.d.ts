import type { Mutant } from './mutant'

/**
 * Mutants that replace the same range of a file, with the groups of the ranges
 * inside it. The switched file hosts each group once.
 */
export interface MutantRange {
  /**
   * How the group is hosted: a conditional expression or an `if` statement.
   */
  kind: 'expression' | 'block'

  /**
   * Groups of the ranges inside this one, sorted by start.
   */
  children: MutantRange[]

  /**
   * Mutants of the range in list order, not empty.
   */
  mutants: Mutant[]

  /**
   * Offset of the first replaced code unit.
   */
  start: number

  /**
   * Offset just past the last replaced code unit.
   */
  end: number
}
