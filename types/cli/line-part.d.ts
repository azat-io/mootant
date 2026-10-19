/**
 * Part of a line that may be left out when the line is too wide.
 */
export interface LinePart {
  /**
   * Columns the part is measured with when wider than its text, so a part that
   * grows, such as a count, keeps the same parts on the line as it grows; a
   * part with an empty text only holds its room and shows nothing.
   */
  width?: number

  /**
   * Text of the part, colors allowed.
   */
  text: string

  /**
   * When the part is left out: the part with the highest rank goes first, so 1
   * marks the most important part.
   */
  rank: number
}
