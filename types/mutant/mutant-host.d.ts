import type { SourceRange } from '../source/source-range'
import type { TextEdit } from '../source/text-edit'

/**
 * How the mutant switch hosts a mutant, with what the host needs: a mutant that
 * replaces a range is hosted around that range, and the removal of an array
 * element or an object member is hosted with the other removals of its
 * literal.
 */
export type MutantHost = RemovalHost | RangeHost

/**
 * Mutant hosted around the range it replaces.
 */
interface RangeHost {
  /**
   * `expression` for a conditional expression around the replaced expression,
   * `block` for an `if`/`else` around the replaced statement.
   */
  kind: 'expression' | 'block'

  /**
   * Edit inside the replaced range that the mutant amounts to, which reports
   * show in place of the whole range; absent when the mutator names none.
   */
  focus?: TextEdit
}

/**
 * Removal of an array element (`element`) or an object member (`property`),
 * hosted at its literal: the switched file runs the literal as written unless
 * one of its removals is active, and then a copy without that element.
 */
interface RemovalHost {
  /**
   * `element` in an array literal, `property` in an object literal.
   */
  kind: 'property' | 'element'

  /**
   * Range of the literal the element or member is removed from.
   */
  list: SourceRange

  /**
   * The removed element or member, with an empty text; reports show it in place
   * of the whole range.
   */
  focus: TextEdit
}
