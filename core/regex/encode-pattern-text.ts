import type { RegexSource } from '../../types/regex/regex-source'

/**
 * Escapes of characters that cannot stand as they are in a string literal.
 */
const STRING_ESCAPES: Readonly<Record<string, string>> = {
  '\u{2028}': String.raw`\u2028`,
  '\u{2029}': String.raw`\u2029`,
  '\0': String.raw`\x00`,
  '\n': String.raw`\n`,
  '\r': String.raw`\r`,
  '\\': '\\\\',
}

/**
 * Units that a string or template literal escapes: backslashes, line
 * terminators, quotes, `${`, the null character and surrogates without their
 * pair.
 */
const SPECIAL_PATTERN = /[\p{Cs}\0\n\r"$'\\`\u{2028}\u{2029}]/u

/**
 * Writes pattern text in the source form of a regular expression, to be put
 * between the quotes of its literal. A literal or a `String.raw` template takes
 * the text as it is. A string escapes backslashes, its own quote and line
 * terminators; a template escapes backslashes, backticks, `${` and carriage
 * returns; both write the null character as `\x00`, which a digit after it
 * cannot turn into an octal escape. A surrogate without its pair, which an edit
 * of a pattern without the `u` flag may leave, is written as a `\u` escape in
 * every form: the string escape gives the same unit, and in a regular
 * expression the escape matches the same unit. In a literal or a `String.raw`
 * template the escape replaces the backslash of an identity escape of the
 * surrogate, which would escape the backslash of the new escape instead.
 *
 * @param text - Pattern text as the regular expression sees it.
 * @param form - Source form of the regular expression.
 * @param quote - Quote of a string literal.
 * @returns Text for the source.
 */
export function encodePatternText(
  text: string,
  form: RegexSource['form'],
  quote: string,
): string {
  if (!SPECIAL_PATTERN.test(text)) {
    return text
  }

  /**
   * Writes one character that is not a surrogate.
   *
   * @param character - Character of the pattern text.
   * @param next - Character after it, if any.
   * @returns Text for the source.
   */
  function encodeCharacter(
    character: string,
    next: undefined | string,
  ): string {
    switch (form) {
      case 'template':
        if (
          character === '\\' ||
          character === '`' ||
          (character === '$' && next === '{')
        ) {
          return `\\${character}`
        }
        if (character === '\r' || character === '\0') {
          return STRING_ESCAPES[character]!
        }
        return character
      case 'string':
        if (character === quote) {
          return `\\${quote}`
        }
        return STRING_ESCAPES[character] ?? character
      default:
        return character
    }
  }

  let isRaw = form === 'literal' || form === 'raw'
  let isEscaping = false
  let result = ''
  for (let index = 0; index < text.length; index++) {
    let unit = text.charCodeAt(index)
    if (unit < 0xd8_00 || unit > 0xdf_ff) {
      result += encodeCharacter(text[index]!, text[index + 1])
      isEscaping = isRaw && !isEscaping && text[index] === '\\'
    } else if (text.codePointAt(index)! > 0xff_ff) {
      result += text.slice(index, index + 2)
      index += 1
      isEscaping = false
    } else {
      if (isEscaping) {
        result = result.slice(0, -1)
      }
      result += String.raw`\u${unit.toString(16).toUpperCase()}`
      isEscaping = false
    }
  }
  return result
}
