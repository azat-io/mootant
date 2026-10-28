import type { StatusCounts } from '../run/status-counts'
import type { IndexedMutant } from './indexed-mutant'
import type { ModuleCost } from '../run/module-cost'
import type { IndexedSkip } from './indexed-skip'

/**
 * Mutated file of the HTML report with its mutants, counts and score.
 */
export interface IndexedFile {
  /**
   * Mutants to act on (`Survived`, `NoCoverage`, `Error`), in file order.
   */
  actionable: IndexedMutant[]

  /**
   * Mutants in file order.
   */
  mutants: IndexedMutant[]

  /**
   * Isolated cost of its mutants, or null when none ran isolated.
   */
  cost: ModuleCost | null

  /**
   * Skipped candidates in file order.
   */
  skipped: IndexedSkip[]

  /**
   * Offset where each line starts.
   */
  lineStarts: number[]

  /**
   * Mutants by status.
   */
  counts: StatusCounts

  /**
   * Total score of its mutants, or null without mutants to score.
   */
  score: number | null

  /**
   * Directory part of the path, without the last `/`, or empty.
   */
  directory: string

  /**
   * Whether the text of the file could be read.
   */
  readable: boolean

  /**
   * Text of the file, empty when it could not be read.
   */
  source: string

  /**
   * Position in the files of the report.
   */
  index: number

  /**
   * Path relative to the project root.
   */
  path: string

  /**
   * Last part of the path.
   */
  name: string
}
