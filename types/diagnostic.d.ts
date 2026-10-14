/**
 * Problem found while listing mutants that does not stop the run.
 */
export interface Diagnostic {
  /**
   * Machine-readable kind of the problem. `parse-error`, `read-error` and
   * `mutator-error` have the severity `error`; the others are warnings.
   */
  code:
    | 'unclosed-ignore-start'
    | 'unmatched-ignore-end'
    | 'malformed-directive'
    | 'unknown-mutator'
    | 'mutator-error'
    | 'skipped-path'
    | 'parse-error'
    | 'read-error'

  /**
   * `error` when a file could not be listed completely, `warning` when the list
   * is complete but something needs attention.
   */
  severity: 'warning' | 'error'

  /**
   * 1-based UTF-16 column, or null when the problem has no position.
   */
  column: number | null

  /**
   * Path of the file as reports print it, or null for problems of the run.
   */
  file: string | null

  /**
   * 1-based line, or null when the problem has no position.
   */
  line: number | null

  /**
   * One or more complete sentences that name the problem.
   */
  message: string
}
