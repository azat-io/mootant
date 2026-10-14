/**
 * Line terminators of ECMAScript: CRLF, CR, LF, U+2028 and U+2029.
 */
let lineTerminatorPattern = /\r\n?|[\n\u{2028}\u{2029}]/gu

/**
 * Lists the offsets at which the lines of a text start.
 *
 * @param text - Text as read from disk.
 * @returns Start offset of every line in order. The first entry skips a leading
 *   byte order mark, so columns match what editors show.
 */
export function getLineStarts(text: string): number[] {
  let starts = [text.codePointAt(0) === 0xfe_ff ? 1 : 0]
  for (let match of text.matchAll(lineTerminatorPattern)) {
    starts.push(match.index + match[0].length)
  }
  return starts
}
