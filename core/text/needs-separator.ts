/**
 * Pairs of characters that form a different token when written together: a new
 * `<` before a TypeScript type assertion or a JSX element gives `<<`.
 */
let mergingPairs = new Set(['++', '--', '//', '/*', '<<'])

/**
 * Identifier character at the start of a text, a Unicode escape included. The
 * end of a text is tested on its last character, because V8 fails to match a
 * class with a property escape before `$` against an astral character.
 */
const IDENTIFIER_CHARACTER_PATTERN = /^[\p{ID_Continue}$\\\u{200C}\u{200D}]/u

/**
 * Decimal digit at the end of a text.
 */
const DIGIT_END_PATTERN = /\d$/u

/**
 * Tells whether two texts written next to each other would merge into different
 * tokens, so that a space must separate them: `+` and `-b` give `+-b`, but `-`
 * and `-b` give `--b`.
 *
 * @param before - Text on the left of the junction.
 * @param after - Text on the right of the junction.
 * @returns Whether a space is needed at the junction. False when either text is
 *   empty.
 */
export function needsSeparator(before: string, after: string): boolean {
  if (before === '' || after === '') {
    return false
  }
  return (
    mergingPairs.has(before.slice(-1) + after.slice(0, 1)) ||
    (before.endsWith('<') && after.startsWith('!--')) ||
    (IDENTIFIER_CHARACTER_PATTERN.test(getLastCharacter(before)) &&
      IDENTIFIER_CHARACTER_PATTERN.test(after)) ||
    (DIGIT_END_PATTERN.test(before) && after.startsWith('.'))
  )
}

/**
 * Reads the last character of a text, both halves of a surrogate pair included.
 *
 * @param text - Text that is not empty.
 * @returns The last code point of the text as a string.
 */
function getLastCharacter(text: string): string {
  return [...text.slice(-2)].at(-1)!
}
