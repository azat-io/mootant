import type { SkipNote } from '../mutant/skip-note'

/**
 * Edit of a regular expression pattern that a regex mutator considers, with
 * offsets relative to the pattern.
 */
export interface RegexChange {
  /**
   * Why the change is not emitted, or null when it is.
   */
  skip: SkipNote | null

  /**
   * Offset of the first replaced character of the pattern.
   */
  start: number

  /**
   * Text written in place of the range.
   */
  text: string

  /**
   * Offset just past the last replaced character of the pattern.
   */
  end: number
}
