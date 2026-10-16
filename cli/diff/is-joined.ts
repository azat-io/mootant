/**
 * Characters of a word: letters, digits, joining marks, `_` and `$`.
 */
const WORD_PATTERN = /^[\p{L}\p{M}\p{N}$_]/u

/**
 * Characters of an operator, such as `>=`, `??` or `?.`.
 */
const OPERATOR_PATTERN = /^[!%&*+\-./:<=>?^|~]/u

/**
 * Tells whether two graphemes next to each other belong to one token: both word
 * characters, such as the letters of a name or the digits of a number, or both
 * operator characters, such as `>=` or `?.`.
 *
 * @param left - Grapheme on the left.
 * @param right - Grapheme on the right.
 * @returns True when they belong to one word or one operator.
 */
export function isJoined(left: string, right: string): boolean {
  return (
    (WORD_PATTERN.test(left) && WORD_PATTERN.test(right)) ||
    (OPERATOR_PATTERN.test(left) && OPERATOR_PATTERN.test(right))
  )
}
