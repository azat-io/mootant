import type { ActiveMutator } from './active-mutator'
import type { FileMutants } from './file-mutants'
import type { Diagnostic } from './diagnostic'

/**
 * Outcome of a list run, before it is formatted.
 */
export interface ListResult {
  /**
   * Problems of the run that belong to no single file, such as skipped paths.
   */
  diagnostics: Diagnostic[]

  /**
   * Mutators the preset turned on, in canonical order.
   */
  mutators: ActiveMutator[]

  /**
   * Results of every listed file, sorted by path.
   */
  files: FileMutants[]

  /**
   * Id of the preset used.
   */
  preset: string
}
