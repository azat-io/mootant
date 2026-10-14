import type { IgnoreSource } from './ignore-source'
import type { MutantStatus } from './mutant-status'

/**
 * Mutant as an agent needs it, without reading the file.
 */
export interface ListReportMutant {
  /**
   * Ignore directive comment that excluded the mutant, or null while pending.
   */
  ignoredBy: IgnoreSource | null

  /**
   * How the mutant will be switched on, and so how to apply it: wrap the
   * replacement in parentheses for `expression`, in braces for `block`.
   */
  kind: 'expression' | 'block'

  /**
   * Reason of the ignore directive, or null while pending.
   */
  reason: string | null

  /**
   * Dotted names of the declarations around the mutant, or null at the top
   * level.
   */
  scope: string | null

  /**
   * Whether the mutant will be tested.
   */
  status: MutantStatus

  /**
   * One sentence describing the fault the mutator models.
   */
  description: string

  /**
   * Text written in place of `original`.
   */
  replacement: string

  /**
   * Full text of the line where the mutant starts, without its line break.
   */
  sourceLine: string

  /**
   * 1-based UTF-16 column just past the last replaced character.
   */
  endColumn: number

  /**
   * Source text the mutant replaces.
   */
  original: string

  /**
   * 1-based line of the last replaced character.
   */
  endLine: number

  /**
   * Id of the mutator: `name` or `plugin/name`.
   */
  mutator: string

  /**
   * 1-based UTF-16 column of the first replaced character.
   */
  column: number

  /**
   * UTF-16 offset of the first replaced code unit in the file as read.
   */
  start: number

  /**
   * Path relative to the working directory, with `/` separators.
   */
  file: string

  /**
   * 1-based line of the first replaced character.
   */
  line: number

  /**
   * UTF-16 offset just past the last replaced code unit.
   */
  end: number

  /**
   * Stable id of the mutant.
   */
  id: string
}
