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
   * Offset of the node the justifying mutant replaces.
   */
  start: number
}
