/**
 * Mutant that justifies a skip, as a report shows it.
 */
export interface ListReportJustifier {
  /**
   * Id of the listed mutant when the pipeline dropped the candidate in its
   * favor (duplicates and the solitary rule); null when a mutator skipped the
   * candidate or the justifying candidate is not listed itself.
   */
  id: string | null

  /**
   * Id of the mutator of the justifying mutant.
   */
  mutator: string

  /**
   * 1-based UTF-16 column of the justifying mutant: of its focus, or of the
   * range it replaces when it has none.
   */
  column: number

  /**
   * 1-based line of the justifying mutant: of its focus, or of the range it
   * replaces when it has none.
   */
  line: number
}
