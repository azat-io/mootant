/**
 * Git revision a run took its changed lines from, with `--since`.
 */
export interface SinceRevision {
  /**
   * Merge-base commit of the revision and `HEAD` that the working tree was
   * compared with.
   */
  base: string

  /**
   * Revision as given, such as `main`.
   */
  ref: string
}
