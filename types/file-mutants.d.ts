import type { SkippedMutant } from './skipped-mutant'
import type { Diagnostic } from './diagnostic'
import type { Mutant } from './mutant'

/**
 * Result of generating the mutants of one file.
 */
export interface FileMutants {
  /**
   * Problems of the file: a read or parse error, mutator errors and ignore
   * directive warnings.
   */
  diagnostics: Diagnostic[]

  /**
   * Candidates that were considered and not emitted, in canonical order. Empty
   * unless the run asked for them.
   */
  skipped: SkippedMutant[]

  /**
   * Text of the file as read, or null when it could not be read.
   */
  source: string | null

  /**
   * Mutants in canonical order, pending and ignored.
   */
  mutants: Mutant[]

  /**
   * Whether the file was read and parsed. A component file is parsed when it
   * has no script block or at least one block parsed; the blocks that failed
   * are reported as parse errors. When false, the file has no mutants.
   */
  parsed: boolean

  /**
   * Path as reports print it.
   */
  file: string
}
