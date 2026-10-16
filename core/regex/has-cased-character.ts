import type { AST } from '@eslint-community/regexpp'

import { loadRegexpp } from './load-regexpp'

/**
 * Highest code point of ASCII; a class range that reaches past it may hold
 * cased letters of other scripts.
 */
const MAX_ASCII = 0x7f

/**
 * Code point of `A`.
 */
const UPPER_A = 0x41

/**
 * Code point of `Z`.
 */
const UPPER_Z = 0x5a

/**
 * Code point of `a`.
 */
const LOWER_A = 0x61

/**
 * Code point of `z`.
 */
const LOWER_Z = 0x7a

/**
 * Tells whether the `i` flag can change what a pattern matches, judged by the
 * tree rather than the raw text, so the `d` of `\d` does not count: a character
 * with a case mapping, a class range that holds an ASCII letter or reaches past
 * ASCII, a Unicode property escape, a backreference, which compares the
 * captured text ignoring case, and with `u` or `v` the word escapes and word
 * boundaries, which then match `ſ` and the Kelvin sign. The answer errs toward
 * true.
 *
 * @param pattern - Pattern tree.
 * @param flags - Flags of the literal.
 * @returns Whether removing or adding `i` may change the matches.
 */
export function hasCasedCharacter(
  pattern: AST.Pattern,
  flags: string,
): boolean {
  let isUnicode = flags.includes('u') || flags.includes('v')
  let found = false
  loadRegexpp().visitRegExpAST(pattern, {
    onCharacterSetEnter(node) {
      found ||= node.kind === 'property' || (node.kind === 'word' && isUnicode)
    },
    onCharacterClassRangeEnter(node) {
      found ||= hasCasedRange(node.min.value, node.max.value)
    },
    onAssertionEnter(node) {
      found ||= node.kind === 'word' && isUnicode
    },
    onCharacterEnter(node) {
      found ||= isCased(node.value)
    },
    onBackreferenceEnter() {
      found = true
    },
  })
  return found
}

/**
 * Tells whether a class range may hold a cased character.
 *
 * @param min - First code point of the range.
 * @param max - Last code point of the range.
 * @returns Whether the range reaches past ASCII or holds an ASCII letter.
 */
function hasCasedRange(min: number, max: number): boolean {
  return (
    max > MAX_ASCII ||
    (min <= UPPER_Z && UPPER_A <= max) ||
    (min <= LOWER_Z && LOWER_A <= max)
  )
}

/**
 * Tells whether a character has another case.
 *
 * @param value - Code point of the character.
 * @returns Whether its lower or upper case differs from it.
 */
function isCased(value: number): boolean {
  let text = String.fromCodePoint(value)
  return text.toLowerCase() !== text || text.toUpperCase() !== text
}
