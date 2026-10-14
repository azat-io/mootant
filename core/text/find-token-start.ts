import type { ParsedFile } from '../../types/parsed-file'

/**
 * Characters that never start a token: ECMAScript white space and line
 * terminators (`\s` matches exactly those, U+FEFF included) and parentheses.
 */
const SKIPPED_CHARACTER_PATTERN = /[\s()]/u

/**
 * Finds the first offset of a range that is not white space, a line terminator,
 * a comment or a parenthesis. Used to locate punctuation such as an operator,
 * `?.`, `,` or `;` between two nodes.
 *
 * @param parsed - File whose text and comments are scanned.
 * @param start - First offset to look at; it must be a token boundary, not a
 *   position inside a comment, string, template or regular expression.
 * @param end - Offset at which the scan stops, exclusive.
 * @returns The offset of the first token character, or -1 when the range has
 *   none.
 */
export function findTokenStart(
  parsed: ParsedFile,
  start: number,
  end: number,
): number {
  let offset = start
  while (offset < end) {
    let commentEnd = parsed.commentEnds.get(offset)
    if (commentEnd !== undefined) {
      offset = commentEnd
    } else if (SKIPPED_CHARACTER_PATTERN.test(parsed.text[offset]!)) {
      offset += 1
    } else {
      return offset
    }
  }
  return -1
}
