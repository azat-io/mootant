/**
 * Position in a file as editors count it.
 */
export interface SourcePosition {
  /**
   * 1-based column in UTF-16 code units. A byte order mark is not counted.
   */
  column: number

  /**
   * 1-based line. LF, CR, CRLF, U+2028 and U+2029 end a line.
   */
  line: number
}
