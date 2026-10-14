/**
 * Mutator that took part in a list run.
 */
export interface ListReportMutator {
  /**
   * One sentence describing the fault it models.
   */
  description: string

  /**
   * Number of its mutants, pending and ignored.
   */
  mutants: number

  /**
   * Id: `name` or `plugin/name`.
   */
  id: string
}
