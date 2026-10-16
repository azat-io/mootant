/**
 * Source lines a mutant touches, before and after it is applied. A long line
 * keeps at most 80 code units of unchanged text before and after the change.
 */
export interface ListReportDiff {
  /**
   * Code units of the first line left out at its start, the same on both sides;
   * 0 when it starts with the line.
   */
  cutStart: number

  /**
   * Lines from `line` to `endLine` as read, without line breaks.
   */
  before: string[]

  /**
   * Lines from `line` to `endLine` with the replacement written in place of
   * `original`, without line breaks; the replacement may add or remove lines.
   */
  after: string[]

  /**
   * Code units of the last line left out at its end, the same on both sides; 0
   * when it ends with the line.
   */
  cutEnd: number
}
