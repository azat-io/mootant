import type { SourceRange } from '../../types/source/source-range'

/**
 * Runs of code units other than line terminators.
 */
const BLANKED_PATTERN = /[^\n\r\u{2028}\u{2029}]+/gu

/**
 * Blanks the text of a file outside some ranges: every code unit except line
 * terminators and a leading byte order mark becomes a space, so offsets, lines
 * and columns stay those of the file.
 *
 * @param source - Text of the file.
 * @param ranges - Ranges to keep, in source order, without overlaps.
 * @returns Text of the same length with only the ranges, the line terminators
 *   and a leading byte order mark left.
 */
export function blankOutside(
  source: string,
  ranges: readonly SourceRange[],
): string {
  let text = source.codePointAt(0) === 0xfe_ff ? source[0]! : ''
  let cursor = text.length
  for (let { start, end } of ranges) {
    text += blank(source.slice(cursor, start)) + source.slice(start, end)
    cursor = end
  }
  return text + blank(source.slice(cursor))
}

/**
 * Replaces every code unit of a text except line terminators with a space.
 *
 * @param text - Text to blank.
 * @returns Blank text of the same length and lines.
 */
function blank(text: string): string {
  return text.replaceAll(BLANKED_PATTERN, run => ' '.repeat(run.length))
}
