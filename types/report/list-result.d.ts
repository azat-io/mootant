import type { ActiveMutator } from '../mutator/active-mutator'
import type { SinceRevision } from '../git/since-revision'
import type { FileMutants } from '../mutant/file-mutants'
import type { Diagnostic } from '../mutant/diagnostic'

/**
 * Outcome of a list run, before it is formatted.
 */
export interface ListResult {
  /**
   * Revision of `--since` with its merge base, or null without it.
   */
  since: SinceRevision | null

  /**
   * Problems of the run that belong to no single file, such as skipped paths.
   */
  diagnostics: Diagnostic[]

  /**
   * Mutators the preset turned on, in canonical order.
   */
  mutators: ActiveMutator[]

  /**
   * Results of every listed file, sorted by path; with `--since`, only the
   * changed files and their mutants on changed lines.
   */
  files: FileMutants[]

  /**
   * Whether the files list their skipped candidates.
   */
  skipped: boolean

  /**
   * Id of the preset used.
   */
  preset: string
}
