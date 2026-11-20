/**
 * One string literal in double or single quotes without a backslash, which only
 * JavaScript reads as an escape, and without a control character, such as a tab
 * or a line break, which some compilers fold into a space or escape in a JSX
 * attribute value.
 */
const STRING_PATTERN = /^(?:"[^\p{Cc}"\\]*"|'[^\p{Cc}'\\]*')$/u

/**
 * Start of a character reference, such as `&amp;` or `&#65;`, which JSX decodes
 * in an attribute value and JavaScript keeps as written. Any `&#` counts, since
 * compilers differ in what they decode after it.
 */
const REFERENCE_PATTERN = /&(?:#|\w+;)/u

/**
 * Tells whether a text is a string literal that means the same string as a
 * quoted JSX attribute value and as JavaScript: one string in double or single
 * quotes without a backslash, a control character or a character reference. The
 * mutant switch can move such a value into braces as it is written.
 *
 * @param text - Text of a string literal or of a quoted attribute value.
 * @returns Whether JSX and JavaScript read the text as the same string.
 */
export function isPlainAttributeString(text: string): boolean {
  return STRING_PATTERN.test(text) && !REFERENCE_PATTERN.test(text)
}
