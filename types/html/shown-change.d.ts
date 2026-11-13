/**
 * Change of a text as the page shows it: a range of the file, the whole text
 * written in its place and, when there is one, the part of the range the change
 * amounts to.
 */
export interface ShownChange {
  /**
   * Part of the range the change amounts to, when the mutator names one or the
   * change removes an array element or an object member with its comma.
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
