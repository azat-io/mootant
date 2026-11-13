/**
 * Mutant that justifies a skip.
 */
export interface SkipJustifier {
  /**
   * Id of the listed mutant when the skip was decided after ids were assigned,
   * as for duplicates and the solitary rule, and that mutant is listed; null
   * otherwise.
   */
  id: string | null

  /**
   * Id of the mutator of the justifying mutant.
   */
  mutator: string

  /**
   * Offset where the justifying mutant is placed: at its removed element for
   * kinds `element` and `property`, and at the start of the range it replaces
   * otherwise.
   */
  start: number
}
