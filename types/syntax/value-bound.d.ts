import type { Node } from 'oxc-parser'

/**
 * Smallest number an expression can be, as the syntax of its program proves it:
 * every value of the expression that is not null or undefined is a number of at
 * least `lower`.
 */
export interface ValueBound {
  /**
   * Comparisons that the bound rests on when the value is that of a counter
   * which goes down right after them (see `getGuardBound`): a mutant of such a
   * guard may let the counter go below the bound. Omitted when the bound rests
   * on no guard.
   */
  guards?: ReadonlySet<Node>

  /**
   * Whether the expression may also be null or undefined.
   */
  nullable: boolean

  /**
   * Whether every number the expression can be is an integer.
   */
  integer: boolean

  /**
   * Why the bound holds, worded to follow a skip reason, such as "`row` starts
   * at 0 and only grows"; empty only for a start or written value made of
   * number literals alone.
   */
  because: string

  /**
   * Smallest number the expression can be.
   */
  lower: number
}
