import type { IndexedMutant } from './indexed-mutant'
import type { RunStatus } from '../run/run-status'
import type { IndexedFile } from './indexed-file'
import type { IndexedSkip } from './indexed-skip'

/**
 * What the files page shows.
 */
export interface FileView {
  /**
   * Selected mutant, or null.
   */
  selected: IndexedMutant | null

  /**
   * Status of the mutants shown, or `all`: every mutant in the badges and the
   * mutants to act on in the code.
   */
  filter: RunStatus | 'all'

  /**
   * Selected skipped candidate, or null.
   */
  skip: IndexedSkip | null

  /**
   * Whether the code marks the skipped candidates.
   */
  showSkipped: boolean

  /**
   * Text the paths of the file list must contain.
   */
  treeQuery: string

  /**
   * File shown.
   */
  file: IndexedFile
}
