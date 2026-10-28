/**
 * Change of a text as the page shows it: a range of the file, the whole text
 * written in its place and, when the mutator names one, the part of the range
 * the change amounts to.
 */
export interface ShownChange {
  /**
   * Part of the range the change amounts to, when a mutator names one.
   */
  focus?: { replacement: string; start: number; end: number }

  /**
   * Text written in place of the range.
   */
  replacement: string

  /**
   * Offset of the first replaced code unit.
   */
  start: number

  /**
   * Offset just past the last replaced code unit.
   */
  end: number
}
