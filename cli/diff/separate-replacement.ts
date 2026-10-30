import { needsSeparator } from '../../core/text/needs-separator'

/**
 * Adds a space before or after the text of a replacement where, written in
 * place of its range, it would merge with the source text next to it into a
 * different token (see `needsSeparator`), as the parentheses of the mutant
 * switch keep it apart:
 *
 * - `true` in place of `!flag` in `return!flag` reads `return true`;
 * - `2` in place of `1.` in `1..toFixed(2)` reads `2 .toFixed(2)`.
 *
 * @param source - Text of the file as read.
 * @param edit - Range of the replacement and its text.
 * @param edit.start - UTF-16 offset of the first replaced code unit.
 * @param edit.end - UTF-16 offset just past the last replaced code unit.
 * @param edit.replacement - Text written in place of the range.
 * @returns The text with the spaces it needs.
 */
export function separateReplacement(
  source: string,
  edit: { replacement: string; start: number; end: number },
): string {
  let before = source.slice(Math.max(edit.start - 2, 0), edit.start)
  let after = source.slice(edit.end, edit.end + 3)
  let text = edit.replacement
  if (needsSeparator(before, text || after)) {
    text = ` ${text}`
  }
  if (needsSeparator(text, after)) {
    text = `${text} `
  }
  return text
}
