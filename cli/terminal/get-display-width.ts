// spell-checker:ignore FFFD
import { stripAnsi } from './strip-ansi'

/**
 * Starts a character that takes two columns: emoji shown as pictures and East
 * Asian wide or full-width characters, such as Chinese, Japanese and Korean
 * text. A variation selector that asks for the picture form widens a character
 * too.
 */
const WIDE_PATTERN =
  /^[\p{Emoji_Presentation}\u{1100}-\u{115F}\u{2E80}-\u{303E}\u{3041}-\u{33FF}\u{3400}-\u{4DBF}\u{4E00}-\u{9FFF}\u{A000}-\u{A4CF}\u{AC00}-\u{D7A3}\u{F900}-\u{FAFF}\u{FE30}-\u{FE4F}\u{FF00}-\u{FF60}\u{FFE0}-\u{FFE6}\u{20000}-\u{3FFFD}]|\u{FE0F}/u

/**
 * Characters that take no column: controls, format characters such as zero
 * width spaces, and marks that join the character before them.
 */
const ZERO_WIDTH_PATTERN = /^[\p{Cc}\p{Cf}\p{Mn}]+$/u

/**
 * Splits text into the characters people see.
 */
let segmenter = new Intl.Segmenter()

/**
 * Counts the terminal columns a text takes, ignoring color codes, so columns
 * with Chinese, Japanese, Korean text or emoji line up.
 *
 * @param text - Text, possibly with colors.
 * @returns Columns of the text.
 */
export function getDisplayWidth(text: string): number {
  let width = 0
  let graphemes = splitGraphemes(stripAnsi(text))
  for (let grapheme of graphemes) {
    width += getGraphemeWidth(grapheme)
  }
  return width
}

/**
 * Counts the terminal columns one grapheme takes: two for emoji and East Asian
 * wide characters, none for controls and joining marks, one for the rest.
 *
 * @param grapheme - One character as people see it.
 * @returns 0, 1 or 2.
 */
export function getGraphemeWidth(grapheme: string): number {
  if (WIDE_PATTERN.test(grapheme)) {
    return 2
  }
  return ZERO_WIDTH_PATTERN.test(grapheme) ? 0 : 1
}

/**
 * Splits text into graphemes, the characters people see, so an emoji built of
 * several code points or a letter with a joined mark stays whole.
 *
 * @param text - Plain text.
 * @returns Graphemes in order.
 */
export function splitGraphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), ({ segment }) => segment)
}
