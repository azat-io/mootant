import type { ListReportJustifier } from './list-report-justifier'
import type { SkipCategory } from '../mutant/skip-category'
import type { ListReportFocus } from './list-report-focus'

/**
 * Candidate that mootant considered and did not emit, as `--skipped` lists it.
 */
export interface ListReportSkipped {
  /**
   * Mutant that justifies the skip, or null when no single mutant does.
   */
  by: ListReportJustifier | null

  /**
   * Part of the range the change amounts to, present when the mutator names
   * one; text reports show its position and texts.
   */
  focus?: ListReportFocus

  /**
   * Category of the skip: `equivalent`, `noise`, `timeout`, `owned`,
   * `subsumed`, `duplicate` or `invalid`.
   */
  category: SkipCategory

  /**
   * Text that would have been written in place of `original`.
   */
  replacement: string

  /**
   * Whether the skip rests on a guess, such as a method name, a syntactic type
   * hint or a name-based lower bound, rather than on a proof.
   */
  heuristic: boolean

  /**
   * Source text the candidate replaces.
   */
  original: string

  /**
   * Id of the mutator that considered the candidate.
   */
  mutator: string

  /**
   * Plain-English reason of the skip.
   */
  reason: string

  /**
   * 1-based UTF-16 column of the first replaced character.
   */
  column: number

  /**
   * UTF-16 offset of the first replaced code unit in the file as read.
   */
  start: number

  /**
   * Path relative to the project root, with `/` separators.
   */
  file: string

  /**
   * 1-based line of the first replaced character.
   */
  line: number

  /**
   * Id of the skip rule: a catalog label such as `O3` or `R2`, or a short
   * kebab-case name such as `lower-bound` or `duplicate`.
   */
  rule: string

  /**
   * UTF-16 offset just past the last replaced code unit.
   */
  end: number
}
