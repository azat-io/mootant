import { compilesRegex } from './compiles-regex'

/**
 * Line terminators, which end a regular expression literal.
 */
const LINE_TERMINATOR_PATTERN = /[\n\r\u{2028}\u{2029}]/u

/**
 * Tells whether a pattern and flags make a regular expression literal that
 * parses as one literal and compiles: the pattern has no line terminator and no
 * `/` outside a class that is not escaped, which would end the literal early,
 * and `new RegExp` accepts it. Classes are scanned as the lexical grammar does,
 * without nesting: the first `]` that is not escaped ends a class, also with
 * the `v` flag. An empty pattern is valid; it is printed as `(?:)`. The check
 * runs on the Node.js version that runs mootant.
 *
 * @param pattern - Text between the slashes.
 * @param flags - Flags after the closing slash, such as `gi`.
 * @returns Whether the literal is valid.
 */
export function isValidRegexLiteral(pattern: string, flags: string): boolean {
  if (LINE_TERMINATOR_PATTERN.test(pattern)) {
    return false
  }
  let inClass = false
  for (let index = 0; index < pattern.length; index++) {
    switch (pattern[index]) {
      case '\\':
        index += 1
        break
      case '[':
        inClass = true
        break
      case ']':
        inClass = false
        break
      case '/':
        if (!inClass) {
          return false
        }
        break
      default:
        break
    }
  }
  return compilesRegex(pattern, flags)
}
